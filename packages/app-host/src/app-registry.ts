/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import {
  InvalidAppIdError,
  AppCapacityExceededError,
  AppAlreadyExistsError,
  AppCreateFailedError,
  AppNotFoundError,
  AppRegistryError,
  AppReloadFailedError,
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
  AppReadinessPolicy,
  AppReadinessResponseExpectation,
  AppRequestMetadata,
  AppSnapshot,
  ConfigureInactiveAppOptions,
  DeactivateAppOptions,
} from './app-types.ts';

const DEFAULT_READINESS_TIMEOUT_MS = 30_000;
const DEFAULT_READINESS_INTERVAL_MS = 250;
const DEFAULT_READINESS_SUCCESS_THRESHOLD = 1;

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

interface ResolvedAppReadinessPolicy {
  timeoutMs: number;
  intervalMs: number;
  successThreshold: number;
  expect?: AppReadinessResponseExpectation;
}

export class AppRuntimeRegistry {
  readonly events: AppEventBus = new AppEventBus();

  private readonly definitions = new Map<string, AppDefinition>();
  private readonly runtimes = new Map<string, ActiveAppHandle>();
  private readonly runtimeConfigs = new Map<
    string,
    Readonly<Record<string, unknown>>
  >();
  private readonly deactivatedApps = new Set<string>();
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
      this.requireRegisteredDefinition(id);
      if (this.runtimes.has(id)) {
        throw new AppRegistryError(
          `App "${id}" has an active runtime; deploy a release instead of replacing its definition`,
          {
            status: 409,
            code: 'APP_DEFINITION_ACTIVE',
          },
        );
      }

      const definition = this.createDefinition(id, {
        ...options,
        ...(this.deactivatedApps.has(id) ? { enabled: false } : {}),
      });
      this.definitions.set(id, definition);
      return definition;
    });
  }

  async configureInactive(
    id: string,
    options: ConfigureInactiveAppOptions,
  ): Promise<AppDefinition> {
    return this.withAppLock(id, async () => {
      if (options.target.id !== id) {
        throw new AppRegistryError(
          `Definition target "${options.target.id}" does not match app "${id}"`,
          {
            status: 400,
            code: 'APP_DEFINITION_TARGET_INVALID',
          },
        );
      }
      if (this.runtimes.has(id)) {
        throw new AppRegistryError(
          `App "${id}" has an active runtime; deploy a release instead of replacing its definition`,
          {
            status: 409,
            code: 'APP_DEFINITION_ACTIVE',
          },
        );
      }

      const definition = this.createDefinition(id, options.target);
      const runtimeConfig =
        options.runtimeConfig === null ? null : { ...options.runtimeConfig };

      this.definitions.set(id, definition);
      if (runtimeConfig === null) {
        this.runtimeConfigs.delete(id);
      } else {
        this.runtimeConfigs.set(id, runtimeConfig);
      }
      if (definition.enabled) {
        this.deactivatedApps.delete(id);
      } else {
        this.deactivatedApps.add(id);
      }

      return definition;
    });
  }

  async unregister(
    id: string,
    options: DestroyAppOptions = {},
  ): Promise<boolean> {
    return this.destroy(id, { ...options, removeDefinition: true });
  }

  async deactivate(
    id: string,
    options: DeactivateAppOptions,
  ): Promise<AppDefinition> {
    return this.withAppLock(id, async () => {
      this.requireRegisteredDefinition(id);
      if (options.target.id !== id) {
        throw new AppRegistryError(
          `Definition target "${options.target.id}" does not match app "${id}"`,
          {
            status: 400,
            code: 'APP_DEFINITION_TARGET_INVALID',
          },
        );
      }

      const definition = this.createDefinition(id, {
        ...options.target,
        enabled: false,
      });
      this.definitions.set(id, definition);
      this.deactivatedApps.add(id);
      if (options.runtimeConfig === null) {
        this.runtimeConfigs.delete(id);
      } else if (options.runtimeConfig !== undefined) {
        this.runtimeConfigs.set(id, { ...options.runtimeConfig });
      }

      await this.evictUnlocked(id, options, 'manual');
      return definition;
    });
  }

  async ensureActive(id: string): Promise<AppSnapshot> {
    return this.withAppLock(id, () => this.ensureActiveUnlocked(id));
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
      const definition = this.requireRunnableDefinition(id);
      const oldRuntime = this.runtimes.get(id);

      try {
        const newRuntime = await this.activateDefinition(
          definition,
          this.runtimeConfigs.get(id),
        );
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
    options: DeployAppOptions,
  ): Promise<AppDeploymentResult> {
    return this.withAppLock(id, async () => {
      const currentDefinition = this.definitions.get(id);
      const oldRuntime = this.runtimes.get(id);
      const oldSnapshot = oldRuntime?.snapshot() ?? null;
      const previousReleaseId = oldSnapshot?.releaseId ?? null;

      if (previousReleaseId !== options.expectedCurrentReleaseId) {
        throw new AppRegistryError(
          `App "${id}" active release changed from the expected value`,
          {
            status: 409,
            code: 'APP_DEPLOYMENT_CONFLICT',
          },
        );
      }

      const targetDefinition = this.createDeploymentTarget(id, options.target);
      const targetReleaseId = targetDefinition.release!.releaseId;
      const targetRuntimeConfig = options.runtimeConfig
        ? { ...options.runtimeConfig }
        : this.runtimeConfigs.get(id);

      let candidate: ActiveAppHandle | null = null;
      let bindingSwitched = false;
      const exposeAfterReadiness = this.deactivatedApps.has(id);

      try {
        if (!oldRuntime) {
          await this.evictForCapacity();
        }

        candidate = await this.activateDefinition(
          targetDefinition,
          targetRuntimeConfig,
        );
        await this.assertReadiness(
          candidate,
          targetDefinition,
          options.readiness,
          'before switching',
        );

        if (!exposeAfterReadiness) {
          this.definitions.set(id, targetDefinition);
        }
        this.runtimes.set(id, candidate);
        bindingSwitched = true;

        try {
          await this.assertReadiness(
            candidate,
            targetDefinition,
            options.readiness,
            'after switching',
            false,
          );
        } catch (error) {
          if (currentDefinition) {
            this.definitions.set(id, currentDefinition);
          } else {
            this.definitions.delete(id);
          }
          if (oldRuntime) {
            this.runtimes.set(id, oldRuntime);
          } else {
            this.runtimes.delete(id);
          }
          bindingSwitched = false;
          throw error;
        }

        if (exposeAfterReadiness) {
          this.definitions.set(id, targetDefinition);
        }

        if (targetRuntimeConfig === undefined) {
          this.runtimeConfigs.delete(id);
        } else {
          this.runtimeConfigs.set(id, targetRuntimeConfig);
        }
        this.deactivatedApps.delete(id);

        if (oldRuntime) {
          await oldRuntime.destroy({
            reason: options.reason ?? `deployed release ${targetReleaseId}`,
            timeoutMs: options.drainTimeoutMs,
          });
        }

        const app = candidate.snapshot();
        this.metrics.deployments += 1;
        return {
          id,
          operationId: options.operationId,
          previousReleaseId,
          activeReleaseId: app.releaseId,
          changed: previousReleaseId !== app.releaseId,
          app,
        };
      } catch (error) {
        if (!bindingSwitched && candidate) {
          await candidate.destroy({
            reason: `deployment ${options.operationId} failed`,
            timeoutMs: 0,
          });
        }

        if (error instanceof AppRegistryError) {
          throw error;
        }

        throw new AppRegistryError(`App "${id}" failed to deploy`, {
          status: 500,
          code: 'APP_DEPLOYMENT_FAILED',
          cause: error,
        });
      }
    });
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
        this.runtimeConfigs.delete(id);
        this.deactivatedApps.delete(id);
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
    const failures = results.filter((result) => result.status === 'rejected');

    if (failures.length > 0) {
      const failureReasons: unknown[] = [];
      for (const failure of failures) {
        failureReasons.push(failure.reason);
      }
      throw new AggregateError(
        failureReasons,
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
      definition: this.requireRegisteredDefinition(id),
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
    this.requireRunnableDefinition(id);
    const active = this.runtimes.get(id);
    if (active?.state === 'active') {
      return active;
    }

    return this.withAppLock(id, async () => {
      const existing = this.runtimes.get(id);
      if (existing?.state === 'active') {
        return existing;
      }

      const definition = this.requireRunnableDefinition(id);
      await this.evictForCapacity();
      const runtime = await this.activateDefinition(
        definition,
        this.runtimeConfigs.get(id),
      );
      this.metrics.coldActivations += 1;
      this.runtimes.set(id, runtime);
      return runtime;
    });
  }

  private async ensureActiveUnlocked(id: string): Promise<AppSnapshot> {
    const existing = this.runtimes.get(id);
    if (existing) {
      return existing.snapshot();
    }

    const definition = this.requireRunnableDefinition(id);
    await this.evictForCapacity();
    const runtime = await this.activateDefinition(
      definition,
      this.runtimeConfigs.get(id),
    );
    this.metrics.coldActivations += 1;
    this.runtimes.set(id, runtime);
    return runtime.snapshot();
  }

  private async activateDefinition(
    definition: AppDefinition,
    runtimeConfig?: Readonly<Record<string, unknown>>,
  ): Promise<ActiveAppHandle> {
    if (!definition.enabled) {
      throw new AppStoppedError(definition.id);
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
        runtimeConfig,
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

  private createDeploymentTarget(
    id: string,
    target: AppDefinition,
  ): AppDefinition {
    if (target.id !== id) {
      throw new AppRegistryError(
        `Deployment target "${target.id}" does not match app "${id}"`,
        {
          status: 400,
          code: 'APP_DEPLOYMENT_TARGET_INVALID',
        },
      );
    }

    const definition = this.createDefinition(id, target);
    if (!definition.release?.releaseId) {
      throw new AppRegistryError(
        `Deployment target for app "${id}" must reference a release`,
        {
          status: 400,
          code: 'APP_DEPLOYMENT_TARGET_INVALID',
        },
      );
    }

    return definition;
  }

  private async assertReadiness(
    runtime: ActiveAppHandle,
    definition: AppDefinition,
    options: AppReadinessPolicy | undefined,
    phase: string,
    retry = true,
  ): Promise<void> {
    const configuredPath =
      definition.server?.healthPath ?? definition.healthPath;
    if (!configuredPath) {
      return;
    }

    const policy = this.resolveReadinessPolicy(definition, options);
    const healthPath = `/${configuredPath.replace(/^\/+/, '')}`;
    const deadline = Date.now() + policy.timeoutMs;
    let successes = 0;
    let lastFailure: unknown;

    while (Date.now() < deadline) {
      const remainingMs = Math.max(1, deadline - Date.now());
      try {
        const request = new Request(new URL(healthPath, 'http://app.local'), {
          signal: AbortSignal.timeout(remainingMs),
        });
        const response = await withTimeout(
          runtime.dispatch(request, {
            method: 'GET',
            path: healthPath,
          }),
          remainingMs,
        );
        let ready = response.ok;
        let responseFailure: unknown = ready
          ? undefined
          : new Error(`Readiness returned HTTP ${response.status}`);
        try {
          if (ready && policy.expect) {
            await this.assertReadinessResponse(response, policy.expect);
          }
        } catch (error) {
          ready = false;
          responseFailure = error;
        } finally {
          if (!response.bodyUsed) {
            await response.body?.cancel();
          }
        }

        if (ready) {
          successes += 1;
          if (!retry || successes >= policy.successThreshold) {
            return;
          }
        } else {
          successes = 0;
          lastFailure = responseFailure;
        }
      } catch (error) {
        successes = 0;
        lastFailure = error;
      }

      if (!retry) {
        break;
      }

      const delayMs = Math.min(
        policy.intervalMs,
        Math.max(0, deadline - Date.now()),
      );
      if (delayMs > 0) {
        await delay(delayMs);
      }
    }

    throw new AppRegistryError(
      `App "${definition.id}" readiness failed ${phase} at "${healthPath}"`,
      {
        status: 503,
        code: 'APP_READINESS_FAILED',
        cause: lastFailure,
      },
    );
  }

  private resolveReadinessPolicy(
    definition: AppDefinition,
    options: AppReadinessPolicy | undefined,
  ): ResolvedAppReadinessPolicy {
    const policy: ResolvedAppReadinessPolicy = {
      timeoutMs:
        options?.timeoutMs ??
        definition.resourcePolicy?.startupTimeoutMs ??
        DEFAULT_READINESS_TIMEOUT_MS,
      intervalMs: options?.intervalMs ?? DEFAULT_READINESS_INTERVAL_MS,
      successThreshold:
        options?.successThreshold ?? DEFAULT_READINESS_SUCCESS_THRESHOLD,
      expect: options?.expect,
    };

    if (
      !Number.isFinite(policy.timeoutMs) ||
      policy.timeoutMs <= 0 ||
      !Number.isFinite(policy.intervalMs) ||
      policy.intervalMs <= 0 ||
      !Number.isInteger(policy.successThreshold) ||
      policy.successThreshold <= 0 ||
      !isValidReadinessExpectation(policy.expect)
    ) {
      throw new AppRegistryError('Invalid deployment readiness policy', {
        status: 400,
        code: 'APP_DEPLOYMENT_OPTIONS_INVALID',
      });
    }

    return policy;
  }

  private async assertReadinessResponse(
    response: Response,
    expectation: AppReadinessResponseExpectation,
  ): Promise<void> {
    if (expectation.contentType !== undefined) {
      const actualContentType = response.headers.get('content-type');
      if (
        actualContentType === null ||
        normalizeMediaType(actualContentType) !==
          normalizeMediaType(expectation.contentType)
      ) {
        throw new Error(
          `Readiness returned Content-Type ${JSON.stringify(actualContentType)}; expected ${JSON.stringify(expectation.contentType)}`,
        );
      }
    }

    if (expectation.json !== undefined) {
      const value: unknown = await response.json();
      if (!isJsonObject(value)) {
        throw new Error('Readiness did not return a JSON object');
      }

      for (const [key, expected] of Object.entries(expectation.json)) {
        if (!Object.hasOwn(value, key) || value[key] !== expected) {
          throw new Error(
            `Readiness JSON field ${JSON.stringify(key)} did not match the expected value`,
          );
        }
      }
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

  private requireRegisteredDefinition(id: string): AppDefinition {
    const definition = this.definitions.get(id);
    if (!definition) {
      throw new AppNotFoundError(id);
    }

    return definition;
  }

  private requireRunnableDefinition(id: string): AppDefinition {
    const definition = this.requireRegisteredDefinition(id);
    if (!definition.enabled || this.deactivatedApps.has(id)) {
      throw new AppStoppedError(id);
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

function isValidReadinessExpectation(
  expectation: AppReadinessResponseExpectation | undefined,
): boolean {
  if (expectation === undefined) {
    return true;
  }

  if (typeof expectation !== 'object' || expectation === null) {
    return false;
  }

  if (
    expectation.contentType !== undefined &&
    (typeof expectation.contentType !== 'string' ||
      normalizeMediaType(expectation.contentType) === '')
  ) {
    return false;
  }

  return (
    expectation.json === undefined || isExpectedJsonObject(expectation.json)
  );
}

function isExpectedJsonObject(value: unknown): boolean {
  if (!isJsonObject(value)) {
    return false;
  }

  return Object.values(value).every(
    (entry) =>
      typeof entry === 'string' ||
      (typeof entry === 'number' && Number.isFinite(entry)) ||
      typeof entry === 'boolean',
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeMediaType(contentType: string): string {
  return contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
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

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    operation.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
