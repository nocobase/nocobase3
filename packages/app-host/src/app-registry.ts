/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import {
  AppRegistryError,
  InvalidAppIdError,
  AppCapacityExceededError,
  AppAlreadyExistsError,
  AppCreateFailedError,
  AppNotFoundError,
  AppReloadFailedError,
  AppReadinessFailedError,
  AppReleaseConflictError,
  AppStoppedError,
} from './errors.ts';
import { AppEventBus } from './events.ts';
import { InProcessAppBackend } from './in-process-backend.ts';
import type {
  ActiveAppHandle,
  CreateAppDefinitionOptions,
  DeployAppOptions,
  AppFactory,
  AppActivationBackend,
  AppDefinition,
  AppDeploymentResult,
  AppDestroyOptions,
  AppRequestMetadata,
  AppSnapshot,
} from './app-types.ts';

export interface ReloadAppOptions {
  reason?: string;
  destroyTimeoutMs?: number;
}

export interface DestroyAppOptions extends AppDestroyOptions {
  removeDefinition?: boolean;
}

export interface RegistryHealth {
  apps: AppSnapshot[];
  definitions: AppDefinition[];
  capacity: {
    maxActiveApps: number;
    activeTotal: number;
    idleTtlMs: number;
    evictionIntervalMs: number;
    evictionLoopRunning: boolean;
  };
  metrics: RegistryMetrics;
  registered: number;
  activeTotal: number;
  active: number;
  draining: number;
  destroying: number;
  failed: number;
  operationsInFlight: number;
}

export interface AppRuntimeRegistryOptions {
  backend?: AppActivationBackend;
  resolveFactory?: (
    definition: AppDefinition,
  ) => Promise<AppFactory> | AppFactory;
  maxActiveApps?: number;
  idleTtlMs?: number;
  evictionIntervalMs?: number;
  startEvictionLoop?: boolean;
}

export interface RegistryMetrics {
  activations: number;
  coldActivations: number;
  reloads: number;
  deployments: number;
  evictions: number;
  idleEvictions: number;
  capacityEvictions: number;
  destroys: number;
  activationFailures: number;
  lastActivationDurationMs: number | null;
  lastEvictionDurationMs: number | null;
}

export class AppRuntimeRegistry {
  readonly events: AppEventBus = new AppEventBus();

  private readonly definitions = new Map<string, AppDefinition>();
  private readonly runtimes = new Map<string, ActiveAppHandle>();
  private readonly activationBlocked = new Set<string>();
  private readonly operations = new Map<string, Promise<unknown>>();
  private readonly backend: AppActivationBackend;
  private readonly resolveFactory: (
    definition: AppDefinition,
  ) => Promise<AppFactory> | AppFactory;
  private readonly maxActiveApps: number;
  private readonly idleTtlMs: number;
  private readonly evictionIntervalMs: number;
  private evictionLoop: NodeJS.Timeout | null = null;
  private metrics: RegistryMetrics = {
    activations: 0,
    coldActivations: 0,
    reloads: 0,
    deployments: 0,
    evictions: 0,
    idleEvictions: 0,
    capacityEvictions: 0,
    destroys: 0,
    activationFailures: 0,
    lastActivationDurationMs: null,
    lastEvictionDurationMs: null,
  };
  private versionSequence = 0;

  constructor(options: AppRuntimeRegistryOptions = {}) {
    this.backend = options.backend ?? new InProcessAppBackend(this.events);
    this.resolveFactory =
      options.resolveFactory ??
      (() => {
        throw new Error('No app factory resolver configured');
      });
    this.maxActiveApps = options.maxActiveApps ?? 500;
    this.idleTtlMs = options.idleTtlMs ?? 5 * 60_000;
    this.evictionIntervalMs = options.evictionIntervalMs ?? 60_000;

    if (options.startEvictionLoop ?? true) {
      this.startEvictionLoop();
    }
  }

  async create(
    id: string,
    options: CreateAppDefinitionOptions = {},
  ): Promise<AppSnapshot> {
    return this.withAppLock(id, async () => {
      if (this.definitions.has(id)) {
        throw new AppAlreadyExistsError(id);
      }

      const definition = this.createDefinition(id, options);
      this.definitions.set(id, definition);
      return this.ensureActiveUnlocked(id);
    });
  }

  async register(
    id: string,
    options: CreateAppDefinitionOptions = {},
  ): Promise<AppDefinition> {
    return this.withAppLock(id, async () => {
      if (this.definitions.has(id)) {
        throw new AppAlreadyExistsError(id);
      }

      const definition = this.createDefinition(id, options);
      this.definitions.set(id, definition);
      return definition;
    });
  }

  async updateDefinition(
    id: string,
    options: CreateAppDefinitionOptions = {},
  ): Promise<AppDefinition> {
    return this.withAppLock(id, async () => {
      this.requireDefinition(id);
      const definition = this.createDefinition(id, options);
      this.definitions.set(id, definition);
      return definition;
    });
  }

  async setDefinition(definition: AppDefinition): Promise<AppDefinition> {
    this.assertAppId(definition.id);
    return this.withAppLock(definition.id, async () => {
      this.definitions.set(definition.id, definition);
      return definition;
    });
  }

  async unregister(
    id: string,
    options: DestroyAppOptions = {},
  ): Promise<boolean> {
    return this.destroy(id, { ...options, removeDefinition: true });
  }

  async ensureActive(id: string): Promise<AppSnapshot> {
    return this.withAppLock(id, () => this.ensureActiveUnlocked(id));
  }

  async start(id: string): Promise<AppSnapshot> {
    return this.withAppLock(id, async () => {
      const existing = this.runtimes.get(id);
      this.activationBlocked.delete(id);
      if (existing) {
        return existing.snapshot();
      }
      try {
        const definition = this.requireDefinition(id);
        await this.evictForCapacity();
        const runtime = await this.activateReadyDefinition(definition);
        this.metrics.coldActivations += 1;
        this.runtimes.set(id, runtime);
        return runtime.snapshot();
      } catch (error) {
        this.activationBlocked.add(id);
        throw error;
      }
    });
  }

  async stop(
    id: string,
    options: string | AppDestroyOptions = {},
  ): Promise<boolean> {
    return this.withAppLock(id, async () => {
      this.requireDefinition(id);
      this.activationBlocked.add(id);
      try {
        return await this.evictUnlocked(id, options, 'manual');
      } catch (error) {
        this.activationBlocked.add(id);
        throw error;
      }
    });
  }

  async restart(
    id: string,
    options: ReloadAppOptions = {},
  ): Promise<AppSnapshot> {
    return this.withAppLock(id, async () => {
      const definition = this.requireDefinition(id);
      this.activationBlocked.add(id);
      try {
        await this.evictUnlocked(id, {
          reason: options.reason ?? 'app restarted',
          timeoutMs: options.destroyTimeoutMs,
        });
        this.activationBlocked.delete(id);
        await this.evictForCapacity();
        const runtime = await this.activateReadyDefinition(definition);
        this.metrics.coldActivations += 1;
        this.runtimes.set(id, runtime);
        return runtime.snapshot();
      } catch (error) {
        this.activationBlocked.add(id);
        throw new AppReloadFailedError(definition.id, error);
      }
    });
  }

  blockActivation(id: string): void {
    this.activationBlocked.add(id);
  }

  unblockActivation(id: string): void {
    this.activationBlocked.delete(id);
  }

  isActivationBlocked(id: string): boolean {
    return this.activationBlocked.has(id);
  }

  async evict(
    id: string,
    options: string | AppDestroyOptions = {},
  ): Promise<boolean> {
    return this.evictWithSource(id, options, 'manual');
  }

  async evictIdle(now: number = Date.now()): Promise<AppSnapshot[]> {
    const candidates = this.getEvictableSnapshots()
      .filter((snapshot) => this.isIdle(snapshot, now))
      .sort(sortByLastAccessed);
    const evicted: AppSnapshot[] = [];

    for (const candidate of candidates) {
      const didEvict = await this.evictWithSource(
        candidate.id,
        {
          reason: 'idle app eviction',
        },
        'idle',
      );

      if (didEvict) {
        evicted.push(candidate);
      }
    }

    return evicted;
  }

  async reload(
    id: string,
    options: ReloadAppOptions = {},
  ): Promise<AppSnapshot> {
    return this.withAppLock(id, async () => {
      if (this.activationBlocked.has(id)) {
        throw new AppStoppedError(id);
      }
      const definition = this.requireDefinition(id);
      const oldRuntime = this.runtimes.get(id);

      try {
        const newRuntime = await this.activateDefinition(definition);
        this.runtimes.set(id, newRuntime);

        if (oldRuntime) {
          await oldRuntime.destroy({
            reason:
              options.reason ?? `reloaded by version ${newRuntime.version}`,
            timeoutMs: options.destroyTimeoutMs,
          });
        }

        this.metrics.reloads += 1;
        return newRuntime.snapshot();
      } catch (error) {
        throw new AppReloadFailedError(id, error);
      }
    });
  }

  async deploy(
    id: string,
    options: DeployAppOptions = {},
  ): Promise<AppDeploymentResult> {
    return this.withAppLock(id, async () => {
      const currentDefinition = this.requireDefinition(id);
      const desiredVersion =
        options.version ?? currentDefinition.desiredVersion;
      let definition = currentDefinition;

      if (desiredVersion !== currentDefinition.desiredVersion) {
        definition = this.createDefinition(id, {
          ...currentDefinition,
          desiredVersion,
          code: currentDefinition.code
            ? { ...currentDefinition.code, version: desiredVersion }
            : undefined,
          release: currentDefinition.release
            ? { ...currentDefinition.release, version: desiredVersion }
            : undefined,
        });
      }

      return this.deployDefinitionUnlocked(definition, options);
    });
  }

  async deployDefinition(
    definition: AppDefinition,
    options: DeployAppOptions = {},
  ): Promise<AppDeploymentResult> {
    this.assertAppId(definition.id);
    return this.withAppLock(definition.id, () =>
      this.deployDefinitionUnlocked(definition, options),
    );
  }

  async destroy(
    id: string,
    options: string | DestroyAppOptions = {},
  ): Promise<boolean> {
    return this.withAppLock(id, async () => {
      const destroyOptions =
        typeof options === 'string' ? { reason: options } : options;
      const runtime = this.runtimes.get(id);
      const hadDefinition = this.definitions.has(id);

      if (runtime) {
        await runtime.destroy(destroyOptions);
        this.runtimes.delete(id);
        this.metrics.destroys += 1;
      }

      if (destroyOptions.removeDefinition !== false) {
        this.definitions.delete(id);
        this.activationBlocked.delete(id);
      }

      return Boolean(runtime || hadDefinition);
    });
  }

  async destroyAll(options: string | DestroyAppOptions = {}): Promise<void> {
    this.stopEvictionLoop();
    const ids = [
      ...new Set([...this.definitions.keys(), ...this.runtimes.keys()]),
    ];
    const results = await Promise.allSettled(
      ids.map((id) => this.destroy(id, options)),
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    if (failures.length > 0) {
      const reasons: unknown[] = failures.map(
        (failure): unknown => failure.reason as unknown,
      );
      throw new AggregateError(
        reasons,
        `Failed to destroy ${failures.length} app(s)`,
      );
    }
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  isActive(id: string): boolean {
    return this.runtimes.has(id);
  }

  definition(id: string): AppDefinition | undefined {
    return this.definitions.get(id);
  }

  listDefinitions(): AppDefinition[] {
    return [...this.definitions.values()];
  }

  snapshot(id: string): AppSnapshot | undefined {
    return this.runtimes.get(id)?.snapshot();
  }

  requireSnapshot(id: string): AppSnapshot {
    const snapshot = this.snapshot(id);
    if (!snapshot) {
      throw new AppNotFoundError(id);
    }

    return snapshot;
  }

  status(id: string): { definition: AppDefinition; app: AppSnapshot | null } {
    return {
      definition: this.requireDefinition(id),
      app: this.snapshot(id) ?? null,
    };
  }

  list(): AppSnapshot[] {
    return [...this.runtimes.values()].map((runtime) => runtime.snapshot());
  }

  capacity(): RegistryHealth['capacity'] {
    return {
      maxActiveApps: this.maxActiveApps,
      activeTotal: this.runtimes.size,
      idleTtlMs: this.idleTtlMs,
      evictionIntervalMs: this.evictionIntervalMs,
      evictionLoopRunning: this.evictionLoop !== null,
    };
  }

  getMetrics(): RegistryMetrics {
    return { ...this.metrics };
  }

  health(): RegistryHealth {
    const apps = this.list();

    return {
      apps,
      definitions: this.listDefinitions(),
      capacity: this.capacity(),
      metrics: this.getMetrics(),
      registered: this.definitions.size,
      activeTotal: apps.length,
      active: apps.filter((app) => app.state === 'active').length,
      draining: apps.filter((app) => app.state === 'draining').length,
      destroying: apps.filter((app) => app.state === 'destroying').length,
      failed: apps.filter((app) => app.state === 'failed').length,
      operationsInFlight: this.operations.size,
    };
  }

  startEvictionLoop(): void {
    if (this.evictionLoop || this.evictionIntervalMs <= 0) {
      return;
    }

    this.evictionLoop = setInterval(() => {
      this.evictIdle().catch((error) => {
        console.error('Idle app eviction failed', error);
      });
    }, this.evictionIntervalMs);
    this.evictionLoop.unref?.();
  }

  stopEvictionLoop(): void {
    if (!this.evictionLoop) {
      return;
    }

    clearInterval(this.evictionLoop);
    this.evictionLoop = null;
  }

  async dispatch(
    id: string,
    request: Request,
    metadata: AppRequestMetadata = {},
  ): Promise<Response> {
    const runtime = await this.ensureActiveHandle(id);
    return runtime.dispatch(request, metadata);
  }

  async ensureActiveHandle(id: string): Promise<ActiveAppHandle> {
    return this.withAppLock(id, async () => {
      if (this.activationBlocked.has(id)) {
        throw new AppStoppedError(id);
      }
      const existing = this.runtimes.get(id);
      if (existing) {
        return existing;
      }

      const definition = this.requireDefinition(id);
      await this.evictForCapacity();
      const runtime = await this.activateDefinition(definition);
      this.metrics.coldActivations += 1;
      this.runtimes.set(id, runtime);
      return runtime;
    });
  }

  private async ensureActiveUnlocked(id: string): Promise<AppSnapshot> {
    if (this.activationBlocked.has(id)) {
      throw new AppStoppedError(id);
    }

    const existing = this.runtimes.get(id);
    if (existing) {
      return existing.snapshot();
    }

    const definition = this.requireDefinition(id);
    await this.evictForCapacity();
    const runtime = await this.activateDefinition(definition);
    this.metrics.coldActivations += 1;
    this.runtimes.set(id, runtime);
    return runtime.snapshot();
  }

  private async activateDefinition(
    definition: AppDefinition,
  ): Promise<ActiveAppHandle> {
    if (!definition.enabled) {
      throw new AppNotFoundError(definition.id);
    }

    const version = ++this.versionSequence;

    this.events.emit('app:beforeCreate', {
      appId: definition.id,
      version,
      basePath: definition.basePath,
      state: 'creating',
      metadata: {
        configVersion: definition.configVersion,
        isolation: definition.isolation,
        tier: definition.tier,
      },
    });

    const startedAt = Date.now();
    try {
      const createApp = await this.resolveFactory(definition);
      const runtime = await this.backend.activate({
        definition,
        version,
        createApp,
      });

      // In-process runtimes emit `created` only after activation.
      const activatableRuntime = runtime as ActiveAppHandle & {
        activate?: () => void;
      };
      if (typeof activatableRuntime.activate === 'function') {
        activatableRuntime.activate();
      }

      this.metrics.activations += 1;
      this.metrics.lastActivationDurationMs = Date.now() - startedAt;
      return runtime;
    } catch (error) {
      this.metrics.activationFailures += 1;
      this.events.emit('app:createFailed', {
        appId: definition.id,
        version,
        basePath: definition.basePath,
        state: 'failed',
        error,
      });
      throw new AppCreateFailedError(definition.id, error);
    }
  }

  private async deployDefinitionUnlocked(
    definition: AppDefinition,
    options: DeployAppOptions,
  ): Promise<AppDeploymentResult> {
    const id = definition.id;
    if (this.activationBlocked.has(id)) {
      throw new AppStoppedError(id);
    }
    const oldRuntime = this.runtimes.get(id);
    const oldSnapshot = oldRuntime?.snapshot() ?? null;
    const requestedReleaseId = definition.release?.id ?? null;

    if (
      oldRuntime &&
      requestedReleaseId &&
      oldSnapshot?.releaseId === requestedReleaseId
    ) {
      const currentDefinition = this.definitions.get(id);
      if (
        !currentDefinition ||
        releaseFingerprint(currentDefinition) !== releaseFingerprint(definition)
      ) {
        throw new AppReleaseConflictError(id, requestedReleaseId);
      }
      await options.onBeforePromote?.();
      this.definitions.set(id, definition);
      return {
        id,
        strategy: options.strategy ?? 'blue-green',
        previousVersion: oldSnapshot.codeVersion,
        previousReleaseId: oldSnapshot.releaseId,
        desiredVersion: definition.desiredVersion,
        activeVersion: oldSnapshot.codeVersion,
        activeReleaseId: oldSnapshot.releaseId,
        changed: false,
        app: oldSnapshot,
      };
    }

    let candidate: ActiveAppHandle | null = null;
    let promoted = false;
    try {
      if (!oldRuntime) {
        await this.evictForCapacity();
      }

      candidate = await this.activateDefinition(definition);
      if (options.waitForReady !== false) {
        await this.checkRuntimeReady(candidate, definition);
      }

      await options.onBeforePromote?.();

      this.definitions.set(id, definition);
      this.runtimes.set(id, candidate);
      promoted = true;

      if (oldRuntime) {
        await oldRuntime
          .destroy({
            reason:
              options.reason ??
              `deployed release ${requestedReleaseId ?? definition.desiredVersion}`,
            timeoutMs: options.destroyTimeoutMs,
          })
          .catch((error) => {
            console.warn(`Failed to drain previous runtime for ${id}`, error);
          });
      }

      const app = candidate.snapshot();
      this.metrics.deployments += 1;
      return {
        id,
        strategy: options.strategy ?? 'blue-green',
        previousVersion: oldSnapshot?.codeVersion ?? null,
        previousReleaseId: oldSnapshot?.releaseId ?? null,
        desiredVersion: definition.desiredVersion,
        activeVersion: app.codeVersion,
        activeReleaseId: app.releaseId,
        changed:
          oldSnapshot?.releaseId !== app.releaseId ||
          oldSnapshot?.codeVersion !== app.codeVersion,
        app,
      };
    } catch (error) {
      if (!promoted && candidate && candidate !== oldRuntime) {
        await candidate
          .destroy({
            reason: 'candidate deployment failed',
            timeoutMs: options.destroyTimeoutMs,
          })
          .catch((destroyError) => {
            console.warn(
              `Failed to destroy deployment candidate for ${id}`,
              destroyError,
            );
          });
      }
      if (error instanceof AppRegistryError) {
        throw error;
      }
      throw new AppReloadFailedError(id, error);
    }
  }

  private async checkRuntimeReady(
    runtime: ActiveAppHandle,
    definition: AppDefinition,
  ): Promise<void> {
    const healthPath = definition.healthPath;
    if (!healthPath) {
      return;
    }

    const timeoutMs = definition.resourcePolicy?.startupTimeoutMs ?? 10_000;
    const controller = new AbortController();
    let timeout: NodeJS.Timeout | undefined;

    try {
      const response = await Promise.race([
        runtime.dispatch(
          new Request(new URL(healthPath, 'http://app.local'), {
            method: 'GET',
            signal: controller.signal,
          }),
          {
            method: 'GET',
            path: healthPath,
          },
        ),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            const error = new AppReadinessFailedError(
              definition.id,
              healthPath,
              `timed out after ${timeoutMs}ms`,
            );
            controller.abort(error);
            reject(error);
          }, timeoutMs);
          timeout.unref?.();
        }),
      ]);
      await response.body?.cancel().catch(() => undefined);
      if (!response.ok) {
        throw new AppReadinessFailedError(
          definition.id,
          healthPath,
          `returned ${response.status}`,
        );
      }
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private async activateReadyDefinition(
    definition: AppDefinition,
  ): Promise<ActiveAppHandle> {
    const runtime = await this.activateDefinition(definition);
    try {
      await this.checkRuntimeReady(runtime, definition);
      return runtime;
    } catch (error) {
      await runtime
        .destroy({ reason: 'app startup readiness check failed' })
        .catch(() => undefined);
      throw error;
    }
  }

  private async evictForCapacity(): Promise<void> {
    if (this.runtimes.size < this.maxActiveApps) {
      return;
    }

    const candidates = this.getEvictableSnapshots().sort(sortByLastAccessed);

    const candidate = candidates[0];
    if (!candidate) {
      throw new AppCapacityExceededError(this.maxActiveApps);
    }

    const didEvict = await this.evictWithSource(
      candidate.id,
      {
        reason: 'max active apps reached',
      },
      'capacity',
    );

    if (!didEvict) {
      throw new AppCapacityExceededError(this.maxActiveApps);
    }
  }

  private async evictWithSource(
    id: string,
    options: string | AppDestroyOptions,
    source: 'manual' | 'idle' | 'capacity',
  ): Promise<boolean> {
    return this.withAppLock(id, () => this.evictUnlocked(id, options, source));
  }

  private async evictUnlocked(
    id: string,
    options: string | AppDestroyOptions = {},
    source: 'manual' | 'idle' | 'capacity' = 'manual',
  ): Promise<boolean> {
    const runtime = this.runtimes.get(id);
    if (!runtime) {
      return false;
    }

    const startedAt = Date.now();
    await runtime.destroy(options);
    this.runtimes.delete(id);
    this.metrics.evictions += 1;
    this.metrics.lastEvictionDurationMs = Date.now() - startedAt;

    if (source === 'idle') {
      this.metrics.idleEvictions += 1;
    }

    if (source === 'capacity') {
      this.metrics.capacityEvictions += 1;
    }

    return true;
  }

  private getEvictableSnapshots(): AppSnapshot[] {
    return [...this.runtimes.values()]
      .map((runtime) => runtime.snapshot())
      .filter(
        (snapshot) =>
          snapshot.activeRequests === 0 && snapshot.tier !== 'dedicated',
      );
  }

  private isIdle(snapshot: AppSnapshot, now: number): boolean {
    const lastTouchedAt = snapshot.lastAccessedAt ?? snapshot.createdAt;
    return now - Date.parse(lastTouchedAt) >= this.idleTtlMs;
  }

  private createDefinition(
    id: string,
    options: CreateAppDefinitionOptions,
  ): AppDefinition {
    this.assertAppId(id);
    const server =
      options.server ??
      options.api ??
      (options.entrypoint && options.rootDir
        ? {
            rootDir: options.rootDir,
            entrypoint: options.entrypoint,
            healthPath: options.healthPath,
          }
        : undefined);

    return {
      id,
      appName: options.appName,
      displayName: options.displayName,
      basePath: options.basePath ?? `/${options.appName ?? id}`,
      enabled: options.enabled ?? true,
      backend: options.backend ?? options.isolation ?? 'in-process',
      configVersion: options.configVersion ?? 'v1',
      isolation: options.isolation ?? options.backend ?? 'in-process',
      tier: options.tier ?? 'warm',
      desiredVersion:
        options.desiredVersion ??
        options.code?.version ??
        options.release?.version ??
        options.configVersion ??
        'v1',
      rootDir: options.rootDir,
      dataDir: options.dataDir,
      client: options.client,
      server,
      api: options.api,
      code: options.code,
      release: options.release,
      healthPath: server?.healthPath ?? options.healthPath,
      resourcePolicy: options.resourcePolicy,
      config: options.config,
    };
  }

  private requireDefinition(id: string): AppDefinition {
    const definition = this.definitions.get(id);
    if (!definition || !definition.enabled) {
      throw new AppNotFoundError(id);
    }

    return definition;
  }

  private async withAppLock<T>(
    id: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.operations.get(id) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.operations.set(id, current);

    try {
      return await current;
    } finally {
      if (this.operations.get(id) === current) {
        this.operations.delete(id);
      }
    }
  }

  private assertAppId(id: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new InvalidAppIdError(id);
    }
  }
}

function releaseFingerprint(definition: AppDefinition): string | null {
  if (!definition.release) {
    return null;
  }

  return JSON.stringify({
    id: definition.release.id,
    version: definition.release.version,
    rootDir: definition.release.rootDir,
    entrypoint: definition.release.entrypoint,
    releaseDir: definition.release.releaseDir,
    checksum: definition.release.checksum ?? null,
  });
}

function sortByLastAccessed(a: AppSnapshot, b: AppSnapshot): number {
  const aTime = a.lastAccessedAt
    ? Date.parse(a.lastAccessedAt)
    : Date.parse(a.createdAt);
  const bTime = b.lastAccessedAt
    ? Date.parse(b.lastAccessedAt)
    : Date.parse(b.createdAt);
  return aTime - bTime;
}
