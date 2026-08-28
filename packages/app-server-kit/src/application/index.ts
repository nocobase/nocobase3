import type { ExecutionContext, Hono } from 'hono';

import type { AppRuntime } from '../runtime/index.js';
import type { ConfigPaths } from '../config/index.js';
import { routerToken } from '../router/index.js';
import { normalizeBasePath, resolveAppName } from '../support/index.js';
import {
  ServiceContainer,
  type ServiceProviderConstructor,
  type ServiceProviderContext,
  ServiceProviderRegistry,
  type ServiceResolver,
} from '@nocobase/service-provider';
import type { AppWebSocketHandler } from '../websocket.js';
import {
  createRealtimeWebSocketHandler,
  registerRealtimeWebSocketRoutes,
} from '../realtime/websocket.js';

export type ApplicationFetchHandler = (
  request: Request,
  env?: unknown,
  executionContext?: ExecutionContext,
) => Response | Promise<Response>;

export type ApplicationWebSocketFactory = (
  services: ServiceResolver,
) => AppWebSocketHandler;

export interface ApplicationConfig {
  readonly app: {
    readonly name: string | undefined;
    readonly publicBasePath: string;
  };
}

export interface ApplicationOptions<
  TConfig extends ApplicationConfig = ApplicationConfig,
> {
  readonly runtime: AppRuntime<TConfig>;
  readonly websocket?: ApplicationWebSocketFactory;
}

/**
 * A composed NocoBase server application.
 *
 * The HTTP router is an application service, not the application itself.
 * Application owns the runtime, service container and provider lifecycle,
 * while fetch and websocket form its framework-neutral host boundary.
 */
export class Application<
  TConfig extends ApplicationConfig = ApplicationConfig,
> {
  public readonly runtime: AppRuntime<TConfig>;
  public readonly serviceContainer: ServiceContainer;
  public readonly fetch: ApplicationFetchHandler = (
    request,
    env,
    executionContext,
  ) => this.router.fetch(request, env, executionContext);
  public readonly websocket: AppWebSocketHandler;

  private readonly providerRegistry: ServiceProviderRegistry<
    AppRuntime<TConfig>
  > = new ServiceProviderRegistry<AppRuntime<TConfig>>();
  private readonly providerContext: ServiceProviderContext<AppRuntime<TConfig>>;
  private readonly websocketFactory: ApplicationWebSocketFactory;
  private readonly usesDefaultWebSocket: boolean;
  private startPromise: Promise<void> | undefined;
  private websocketHandler: AppWebSocketHandler | undefined;

  public constructor(options: ApplicationOptions<TConfig>) {
    this.runtime = options.runtime;
    this.serviceContainer = new ServiceContainer();
    this.providerContext = {
      runtime: this.runtime,
      serviceContainer: this.serviceContainer,
    };
    this.usesDefaultWebSocket = options.websocket === undefined;
    this.websocketFactory = options.websocket ?? createRealtimeWebSocketHandler;
    this.websocket = (request, env) => this.getWebSocketHandler()(request, env);
  }

  public get config(): TConfig {
    return this.runtime.config;
  }

  public get paths(): ConfigPaths {
    return this.runtime.paths;
  }

  public get appName(): string {
    return resolveAppName(this.config.app.name);
  }

  public get publicBasePath(): string {
    return normalizeBasePath(this.config.app.publicBasePath);
  }

  public get router(): Hono {
    return this.serviceContainer.resolve(routerToken);
  }

  public addProvider<TArguments extends readonly unknown[]>(
    Provider: ServiceProviderConstructor<AppRuntime<TConfig>, TArguments>,
    ...args: TArguments
  ): void {
    this.providerRegistry.add(new Provider(this.providerContext, ...args));
  }

  public registerProviders(): void {
    this.providerRegistry.registerAll();
    if (this.usesDefaultWebSocket && this.serviceContainer.has(routerToken)) {
      registerRealtimeWebSocketRoutes(this.router);
    }
  }

  public start(): Promise<void> {
    this.startPromise ??= this.startProviders();
    return this.startPromise;
  }

  public shutdown(): Promise<void> {
    return this.providerRegistry.shutdown();
  }

  private getWebSocketHandler(): AppWebSocketHandler {
    this.websocketHandler ??= this.websocketFactory(this.serviceContainer);
    return this.websocketHandler;
  }

  private async startProviders(): Promise<void> {
    await this.providerRegistry.bootAll();
    await this.providerRegistry.startAll();
    await this.providerRegistry.readyAll();
  }
}
