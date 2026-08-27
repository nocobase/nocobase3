/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { DirectoryAppCatalog } from './app-catalog.ts';
import {
  type AppDesiredState,
  type AppLifecycleStateRecord,
  type AppLifecycleStateStore,
  type AppRuntimeLifecycleState,
} from './app-lifecycle-state.ts';
import type { AppReleaseStateStore } from './app-release-state.ts';
import type { AppRuntimeRegistry } from './app-registry.ts';
import {
  AppLifecycleConflictError,
  AppReleaseIntegrityError,
} from './errors.ts';
import type { AppDefinition, AppSnapshot } from './app-types.ts';

export type AppLifecycleAction = 'start' | 'stop' | 'restart';

export interface AppLifecycleStatus {
  appId: string;
  desiredState: AppDesiredState;
  runtimeState: AppRuntimeLifecycleState;
  updatedAt: string | null;
  lastError: {
    code: string;
    message: string;
  } | null;
}

export interface AppLifecycleResult extends AppLifecycleStatus {
  action: AppLifecycleAction;
  changed: boolean;
  app: AppSnapshot | null;
}

export interface AppLifecycleManagerOptions {
  registry: AppRuntimeRegistry;
  appCatalog: DirectoryAppCatalog;
  releaseStateStore: AppReleaseStateStore;
  lifecycleStateStore: AppLifecycleStateStore;
}

interface LifecycleOperationState {
  state: 'starting' | 'stopping';
}

export class AppLifecycleManager {
  private readonly registry: AppRuntimeRegistry;
  private readonly appCatalog: DirectoryAppCatalog;
  private readonly releaseStateStore: AppReleaseStateStore;
  private readonly lifecycleStateStore: AppLifecycleStateStore;
  private readonly records = new Map<string, AppLifecycleStateRecord>();
  private readonly failures = new Map<
    string,
    { code: string; message: string }
  >();
  private readonly operations = new Map<string, LifecycleOperationState>();
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(options: AppLifecycleManagerOptions) {
    this.registry = options.registry;
    this.appCatalog = options.appCatalog;
    this.releaseStateStore = options.releaseStateStore;
    this.lifecycleStateStore = options.lifecycleStateStore;
  }

  async initialize(): Promise<void> {
    const state = await this.lifecycleStateStore.read();
    this.records.clear();
    for (const record of state.apps) {
      this.records.set(record.appId, record);
      if (record.desiredState === 'stopped') {
        this.registry.blockActivation(record.appId);
      }
    }
  }

  isStopped(appId: string): boolean {
    return this.desiredState(appId) === 'stopped';
  }

  requestBlockedReason(appId: string): 'stopped' | 'in-progress' | null {
    if (this.operations.has(appId)) {
      return 'in-progress';
    }
    return this.isStopped(appId) ? 'stopped' : null;
  }

  status(appId: string): AppLifecycleStatus {
    const record = this.records.get(appId);
    const operation = this.operations.get(appId);
    const failure = this.failures.get(appId) ?? null;
    const runtime = this.registry.snapshot(appId);
    let runtimeState: AppRuntimeLifecycleState;
    if (operation) {
      runtimeState = operation.state;
    } else if (failure) {
      runtimeState = 'failed';
    } else if (runtime) {
      runtimeState = runtime.state === 'failed' ? 'failed' : 'active';
    } else {
      runtimeState = 'stopped';
    }
    return {
      appId,
      desiredState: record?.desiredState ?? 'running',
      runtimeState,
      updatedAt: record?.updatedAt ?? null,
      lastError: failure,
    };
  }

  list(appIds: Iterable<string>): AppLifecycleStatus[] {
    return [...new Set(appIds)]
      .sort((left, right) => left.localeCompare(right))
      .map((appId) => this.status(appId));
  }

  start(appId: string): Promise<AppLifecycleResult> {
    return this.withLock(appId, async (): Promise<AppLifecycleResult> => {
      this.registry.status(appId);
      const changed = this.isStopped(appId) || !this.registry.isActive(appId);
      if (!changed) {
        return this.result(appId, 'start', false);
      }

      this.operations.set(appId, { state: 'starting' });
      this.failures.delete(appId);
      try {
        await this.activateCurrentRelease(appId);
        await this.persistDesiredState(appId, 'running');
        this.operations.delete(appId);
        return this.result(appId, 'start', true);
      } catch (error) {
        await this.failStopped(appId, error);
        throw error;
      } finally {
        this.operations.delete(appId);
      }
    });
  }

  stop(appId: string): Promise<AppLifecycleResult> {
    return this.withLock(appId, async (): Promise<AppLifecycleResult> => {
      this.registry.status(appId);
      const changed =
        !this.isStopped(appId) ||
        this.registry.isActive(appId) ||
        this.failures.has(appId);
      if (!changed) {
        return this.result(appId, 'stop', false);
      }

      try {
        this.operations.set(appId, { state: 'stopping' });
        this.failures.delete(appId);
        await this.persistDesiredState(appId, 'stopped');
        await this.registry.stop(appId, { reason: 'app stopped by operator' });
        this.operations.delete(appId);
        return this.result(appId, 'stop', true);
      } catch (error) {
        this.failures.set(appId, toLifecycleError(error));
        throw error;
      } finally {
        this.operations.delete(appId);
      }
    });
  }

  restart(appId: string): Promise<AppLifecycleResult> {
    return this.withLock(appId, async (): Promise<AppLifecycleResult> => {
      this.registry.status(appId);
      if (this.isStopped(appId)) {
        throw new AppLifecycleConflictError(
          appId,
          'must be started before it can be restarted',
        );
      }

      this.operations.set(appId, { state: 'stopping' });
      this.failures.delete(appId);
      try {
        this.operations.set(appId, { state: 'starting' });
        await this.registry.restart(appId, {
          reason: 'app restarted by operator',
        });
        await this.persistDesiredState(appId, 'running');
        this.operations.delete(appId);
        return this.result(appId, 'restart', true);
      } catch (error) {
        await this.failStopped(appId, error);
        throw error;
      } finally {
        this.operations.delete(appId);
      }
    });
  }

  private desiredState(appId: string): AppDesiredState {
    return this.records.get(appId)?.desiredState ?? 'running';
  }

  private async activateCurrentRelease(appId: string): Promise<void> {
    const releaseState = await this.releaseStateStore.read();
    const activeRelease = releaseState.releases.find(
      (record) => record.appId === appId,
    );
    if (!activeRelease) {
      await this.registry.start(appId);
      return;
    }

    const definition = await this.appCatalog.resolveRelease(
      appId,
      activeRelease.releaseId,
    );
    assertReleaseChecksum(definition, activeRelease.artifactSha256);
    await this.registry.setDefinition(definition);
    await this.registry.start(appId);
  }

  private async persistDesiredState(
    appId: string,
    desiredState: AppDesiredState,
  ): Promise<void> {
    const record = await this.lifecycleStateStore.setDesiredState(
      appId,
      desiredState,
    );
    this.records.set(appId, record);
  }

  private async failStopped(appId: string, error: unknown): Promise<void> {
    this.failures.set(appId, toLifecycleError(error));
    await this.registry
      .stop(appId, {
        reason: 'failed app lifecycle operation',
      })
      .catch(() => undefined);
    await this.persistDesiredState(appId, 'stopped');
  }

  private result(
    appId: string,
    action: AppLifecycleAction,
    changed: boolean,
  ): AppLifecycleResult {
    return {
      ...this.status(appId),
      action,
      changed,
      app: this.registry.snapshot(appId) ?? null,
    };
  }

  private async withLock<T>(
    appId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(appId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.locks.set(appId, current);
    try {
      return await current;
    } finally {
      if (this.locks.get(appId) === current) {
        this.locks.delete(appId);
      }
    }
  }
}

function assertReleaseChecksum(
  definition: AppDefinition,
  expectedChecksum: string,
): void {
  const releaseId = definition.release?.id ?? 'unknown';
  const checksum = definition.release?.checksum;
  if (!checksum || checksum !== expectedChecksum) {
    throw new AppReleaseIntegrityError(
      definition.id,
      releaseId,
      'active release checksum does not match persisted state',
    );
  }
}

function toLifecycleError(error: unknown): { code: string; message: string } {
  const value = error as { code?: unknown; message?: unknown };
  return {
    code: typeof value?.code === 'string' ? value.code : 'APP_LIFECYCLE_FAILED',
    message: typeof value?.message === 'string' ? value.message : String(error),
  };
}
