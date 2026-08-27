/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { addBasePathToRedirectResponse } from '@nocobase/app-server-kit/support';

import {
  AppEventBus,
  type AppEvent,
  type AppEventPayload,
  type AppState,
} from './events.ts';
import type {
  ActiveAppHandle,
  AppFactory,
  AppDefinition,
  AppDisposer,
  AppDestroyOptions,
  FetchApp,
  AppRequestMetadata,
  AppRuntimeResource,
  AppScope,
  AppSnapshot,
  AppWebSocketAcceptResult,
} from './app-types.ts';

export interface AppRuntimeOptions {
  version: number;
  definition: AppDefinition;
  createApp: AppFactory;
  globalEvents: AppEventBus;
}

interface RegisteredDisposer {
  name: string;
  dispose: AppDisposer;
}

export class AppRuntime implements AppScope, ActiveAppHandle {
  readonly id: string;
  readonly appName?: string;
  readonly displayName?: string;
  readonly version: number;
  readonly basePath: string;
  readonly assetsBasePath: string;
  readonly clientDir?: string;
  readonly apiBasePath: string;
  readonly rootDir?: string;
  readonly dataDir?: string;
  readonly config?: unknown;
  readonly backend: AppDefinition['backend'];
  readonly configVersion: string;
  readonly desiredVersion: string;
  readonly codeVersion: string;
  readonly releaseId: string | null;
  readonly isolation: AppDefinition['isolation'];
  readonly tier: AppDefinition['tier'];
  readonly events: AppEventBus = new AppEventBus();
  app!: FetchApp;

  private readonly globalEvents: AppEventBus;
  private readonly abortController = new AbortController();
  private readonly disposers: RegisteredDisposer[] = [];
  private readonly resources = new Map<string, AppRuntimeResource>();
  private readonly beforeDestroyHandlers: AppDisposer[] = [];
  private requestSequence = 0;
  private waitForIdleResolvers: Array<() => void> = [];
  private createdAt = new Date();
  private updatedAt = new Date();
  private lastAccessedAt: Date | null = null;
  private lastError: string | null = null;

  state: AppState = 'creating';
  activeRequests = 0;

  private constructor(options: Omit<AppRuntimeOptions, 'createApp'>) {
    this.id = options.definition.id;
    this.appName = options.definition.appName;
    this.displayName = options.definition.displayName;
    this.version = options.version;
    this.basePath = options.definition.basePath;
    this.assetsBasePath = `${this.basePath}/assets`;
    this.clientDir = options.definition.client?.rootDir;
    this.apiBasePath = `${this.basePath}/api`;
    this.rootDir = options.definition.rootDir;
    this.dataDir = options.definition.dataDir;
    this.config = options.definition.config;
    this.backend = options.definition.backend;
    this.configVersion = options.definition.configVersion;
    this.desiredVersion = options.definition.desiredVersion;
    this.codeVersion =
      options.definition.code?.version ?? options.definition.desiredVersion;
    this.releaseId = options.definition.release?.id ?? null;
    this.isolation = options.definition.isolation;
    this.tier = options.definition.tier;
    this.globalEvents = options.globalEvents;
  }

  static async create(options: AppRuntimeOptions): Promise<AppRuntime> {
    const runtime = new AppRuntime(options);

    try {
      runtime.app = await options.createApp(runtime);
      return runtime;
    } catch (error) {
      runtime.transitionTo('failed');
      runtime.lastError =
        error instanceof Error ? error.message : String(error);
      await runtime.disposeRegisteredResources('app create failed');
      throw error;
    }
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  get abortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  activate(): void {
    this.transitionTo('active');
    this.emit('app:created');
  }

  on(
    event: AppEvent,
    handler: (payload: AppEventPayload) => void | Promise<void>,
  ): () => void {
    return this.events.on(event, handler);
  }

  onBeforeDestroy(handler: () => void | Promise<void>): () => void {
    this.beforeDestroyHandlers.push(handler);
    return () => {
      const index = this.beforeDestroyHandlers.indexOf(handler);
      if (index >= 0) {
        this.beforeDestroyHandlers.splice(index, 1);
      }
    };
  }

  registerDisposer(name: string, dispose: AppDisposer): void {
    if (this.state === 'destroying' || this.state === 'destroyed') {
      throw new Error(
        `Cannot register disposer "${name}" after app ${this.id} has started destroying`,
      );
    }

    this.disposers.push({ name, dispose });
  }

  reportRuntimeResource(resource: AppRuntimeResource): void {
    if (this.state === 'destroying' || this.state === 'destroyed') {
      throw new Error(
        `Cannot report runtime resource "${resource.id}" after app ${this.id} has started destroying`,
      );
    }

    this.resources.set(resource.id, structuredClone(resource));
    this.touch();
  }

  snapshot(): AppSnapshot {
    return {
      id: this.id,
      appName: this.appName,
      displayName: this.displayName,
      version: this.version,
      basePath: this.basePath,
      backend: this.backend,
      configVersion: this.configVersion,
      desiredVersion: this.desiredVersion,
      codeVersion: this.codeVersion,
      releaseId: this.releaseId,
      isolation: this.isolation,
      tier: this.tier,
      state: this.state,
      endpoint: {
        kind: 'in-process',
      },
      activeRequests: this.activeRequests,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      lastAccessedAt: this.lastAccessedAt?.toISOString() ?? null,
      lastError: this.lastError,
      disposerCount: this.disposers.length,
      resources: [...this.resources.values()].map((resource) =>
        structuredClone(resource),
      ),
    };
  }

  async dispatch(
    request: Request,
    metadata: AppRequestMetadata = {},
  ): Promise<Response> {
    if (this.state !== 'active') {
      return new Response(
        JSON.stringify({
          error: `App ${this.id} is ${this.state}`,
        }),
        {
          status:
            this.state === 'draining' || this.state === 'destroying'
              ? 503
              : 410,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    }

    const requestId = `${this.id}-${++this.requestSequence}`;
    const startedAt = Date.now();
    this.activeRequests += 1;
    this.lastAccessedAt = new Date();
    this.touch();
    this.emit('app:requestStart', {
      requestId,
      method: metadata.method ?? request.method,
      path: metadata.path ?? new URL(request.url).pathname,
      activeRequests: this.activeRequests,
    });

    try {
      const response = await this.app.fetch(request, {
        appId: this.id,
        appVersion: this.version,
        appBasePath: this.basePath,
        appAssetsBasePath: this.assetsBasePath,
        appClientDir: this.clientDir,
        appApiBasePath: this.apiBasePath,
        signal: this.abortSignal,
      });

      this.emit('app:requestEnd', {
        requestId,
        method: metadata.method ?? request.method,
        path: metadata.path ?? new URL(request.url).pathname,
        status: response.status,
        durationMs: Date.now() - startedAt,
        activeRequests: this.activeRequests,
      });
      return addBasePathToRedirectResponse(response, this.basePath);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.emit('app:requestError', {
        requestId,
        method: metadata.method ?? request.method,
        path: metadata.path ?? new URL(request.url).pathname,
        durationMs: Date.now() - startedAt,
        error,
        activeRequests: this.activeRequests,
      });
      throw error;
    } finally {
      this.activeRequests -= 1;
      if (this.activeRequests === 0) {
        this.resolveIdleWaiters();
      }
    }
  }

  async acceptWebSocket(
    request: Request,
    metadata: AppRequestMetadata = {},
  ): Promise<AppWebSocketAcceptResult> {
    if (this.state !== 'active') {
      return new Response(
        JSON.stringify({
          error: `App ${this.id} is ${this.state}`,
        }),
        {
          status:
            this.state === 'draining' || this.state === 'destroying'
              ? 503
              : 410,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    }

    if (typeof this.app.websocket !== 'function') {
      return null;
    }

    const requestId = `${this.id}-ws-${++this.requestSequence}`;
    const startedAt = Date.now();
    this.activeRequests += 1;
    this.lastAccessedAt = new Date();
    this.touch();
    this.emit('app:requestStart', {
      requestId,
      method: metadata.method ?? request.method,
      path: metadata.path ?? new URL(request.url).pathname,
      activeRequests: this.activeRequests,
      metadata: {
        transport: 'websocket',
      },
    });

    try {
      const result = await this.app.websocket(request, {
        appId: this.id,
        appVersion: this.version,
        appBasePath: this.basePath,
        appAssetsBasePath: this.assetsBasePath,
        appClientDir: this.clientDir,
        appApiBasePath: this.apiBasePath,
        signal: this.abortSignal,
      });

      this.emit('app:requestEnd', {
        requestId,
        method: metadata.method ?? request.method,
        path: metadata.path ?? new URL(request.url).pathname,
        status: result instanceof Response ? result.status : result ? 101 : 404,
        durationMs: Date.now() - startedAt,
        activeRequests: this.activeRequests,
        metadata: {
          transport: 'websocket',
        },
      });
      return result;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.emit('app:requestError', {
        requestId,
        method: metadata.method ?? request.method,
        path: metadata.path ?? new URL(request.url).pathname,
        durationMs: Date.now() - startedAt,
        error,
        activeRequests: this.activeRequests,
        metadata: {
          transport: 'websocket',
        },
      });
      throw error;
    } finally {
      this.activeRequests -= 1;
      if (this.activeRequests === 0) {
        this.resolveIdleWaiters();
      }
    }
  }

  async destroy(options: string | AppDestroyOptions = {}): Promise<void> {
    if (this.state === 'destroyed') {
      return;
    }

    const destroyOptions =
      typeof options === 'string' ? { reason: options } : options;
    const reason = destroyOptions.reason ?? 'manual destroy';
    const timeoutMs = destroyOptions.timeoutMs ?? 10_000;

    if (this.state !== 'failed' && this.state !== 'creating') {
      this.transitionTo('draining');
    }
    this.emit('app:beforeDrain', {
      reason,
      activeRequests: this.activeRequests,
    });
    this.emit('app:draining', { reason, activeRequests: this.activeRequests });

    await this.waitForIdle(timeoutMs);

    this.abortController.abort(new Error(reason));
    this.emit('app:beforeDestroy', {
      reason,
      activeRequests: this.activeRequests,
    });
    await this.runBeforeDestroyHandlers(reason);

    this.transitionTo('destroying');
    this.emit('app:destroying', {
      reason,
      activeRequests: this.activeRequests,
    });
    await this.disposeRegisteredResources(reason);

    this.events.removeAllListeners();
    this.transitionTo('destroyed');
    this.globalEvents.emit('app:destroyed', this.payload({ reason }));
  }

  private async runBeforeDestroyHandlers(reason: string): Promise<void> {
    for (const handler of [...this.beforeDestroyHandlers]) {
      try {
        await handler();
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        this.emit('app:destroyFailed', {
          reason,
          resourceName: 'beforeDestroy hook',
          error,
        });
      }
    }

    this.beforeDestroyHandlers.length = 0;
  }

  private async disposeRegisteredResources(reason: string): Promise<void> {
    for (const disposer of [...this.disposers].reverse()) {
      this.emit('app:resourceDispose', { reason, resourceName: disposer.name });
      try {
        await disposer.dispose();
        this.emit('app:resourceDisposed', {
          reason,
          resourceName: disposer.name,
        });
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        this.emit('app:destroyFailed', {
          reason,
          resourceName: disposer.name,
          error,
        });
      }
    }

    this.disposers.length = 0;
  }

  private waitForIdle(timeoutMs: number): Promise<void> {
    if (this.activeRequests === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, timeoutMs);
      this.waitForIdleResolvers.push(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  private resolveIdleWaiters(): void {
    const resolvers = this.waitForIdleResolvers;
    this.waitForIdleResolvers = [];
    for (const resolve of resolvers) {
      resolve();
    }
  }

  private emit(
    event: AppEvent,
    overrides: Partial<AppEventPayload> = {},
  ): void {
    const payload = this.payload(overrides);
    this.events.emit(event, payload);
    this.globalEvents.emit(event, payload);
  }

  private transitionTo(state: AppState): void {
    this.state = state;
    this.touch();
  }

  private touch(): void {
    this.updatedAt = new Date();
  }

  private payload(overrides: Partial<AppEventPayload> = {}): AppEventPayload {
    return {
      appId: this.id,
      version: this.version,
      basePath: this.basePath,
      state: this.state,
      ...overrides,
    };
  }
}
