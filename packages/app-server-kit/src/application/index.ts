import type { ExecutionContext, Hono } from 'hono';
import type { AppConfigAccessor } from '../config/index.js';

import type { ConfigPaths } from '../config/index.js';
import {
  apiRouterToken,
  type AppApiRoutes,
  type AppHttpMiddleware,
  type AppRootRoutes,
  RouterProvider,
  routerToken,
} from '../router/index.js';
import { normalizeBasePath, resolveAppName } from '../support/index.js';
import {
  ServiceContainer,
  type ServiceProviderLifecycle,
  ServiceProviderRegistry,
  type ServiceResolver,
} from '@nocobase/service-provider';
import type { AppWebSocketHandler } from '../websocket.js';
import {
  createRealtimeWebSocketHandler,
  registerRealtimeWebSocketRoutes,
} from '../realtime/websocket.js';
import { RealtimeProvider } from '../realtime/provider.js';
import type { ResolvedAppServerPlugins } from '../plugins/index.js';

export type ApplicationFetchHandler = (
  request: Request,
  env?: unknown,
  executionContext?: ExecutionContext,
) => Response | Promise<Response>;

export type ApplicationWebSocketFactory = (
  container: ServiceResolver,
) => AppWebSocketHandler;

export type ApplicationConfig = object;

export interface ApplicationOptions {
  readonly config: AppConfigAccessor;
  readonly mode?: 'standalone' | 'embedded';
  readonly appName: string;
  readonly publicBasePath: string;
  readonly paths: ConfigPaths;
  readonly websocket?: ApplicationWebSocketFactory;
}

export type ApplicationServiceProviderConstructor<
  TArguments extends readonly unknown[] = [],
> = new (app: Application, ...args: TArguments) => ServiceProviderLifecycle;

export interface ApplicationRuntimeContributions {
  readonly plugins: ResolvedAppServerPlugins;
  readonly providers: readonly ApplicationServiceProviderConstructor[];
  readonly apiRoutes: readonly AppApiRoutes<Application>[];
  readonly rootRoutes: readonly AppRootRoutes<Application>[];
}

/**
 * A composed NocoBase server application.
 *
 * The HTTP router is an application service, not the application itself.
 * Application owns its resolved config, paths, service container and provider lifecycle,
 * while fetch and websocket form its framework-neutral host boundary.
 */
export class Application {
  public readonly config: AppConfigAccessor;
  public readonly mode: 'standalone' | 'embedded';
  public readonly paths: ConfigPaths;
  public readonly container: ServiceContainer;
  public readonly fetch: ApplicationFetchHandler = async (
    request,
    env,
    executionContext,
  ) => {
    await this.start();
    return this.router.fetch(request, env, executionContext);
  };
  public readonly websocket: AppWebSocketHandler;

  private readonly providerRegistry: ServiceProviderRegistry =
    new ServiceProviderRegistry();
  private readonly appNameValue: string;
  private readonly publicBasePathValue: string;
  private readonly websocketFactory: ApplicationWebSocketFactory;
  private readonly usesDefaultWebSocket: boolean;
  private providersRegistered = false;
  private routesRegistered = false;
  private readonly apiRoutes: AppApiRoutes<Application>[] = [];
  private readonly httpMiddleware: AppHttpMiddleware<Application>[] = [];
  private readonly rootRoutes: AppRootRoutes<Application>[] = [];
  private startPromise: Promise<void> | undefined;
  private websocketHandler: AppWebSocketHandler | undefined;

  public constructor(options: ApplicationOptions) {
    this.config = options.config;
    this.mode = options.mode ?? 'embedded';
    this.appNameValue = resolveAppName(options.appName);
    this.publicBasePathValue = normalizeBasePath(options.publicBasePath);
    this.paths = options.paths;
    this.container = new ServiceContainer();
    this.usesDefaultWebSocket = options.websocket === undefined;
    this.websocketFactory = options.websocket ?? createRealtimeWebSocketHandler;
    this.websocket = async (request, env) => {
      await this.start();
      return this.getWebSocketHandler()(request, env);
    };
    this.addProvider(RouterProvider);
    if (this.usesDefaultWebSocket) {
      this.addProvider(RealtimeProvider);
    }
  }

  public get appName(): string {
    return this.appNameValue;
  }

  public get publicBasePath(): string {
    return this.publicBasePathValue;
  }

  public get router(): Hono {
    return this.container.resolve(routerToken);
  }

  public get apiRouter(): Hono {
    return this.container.resolve(apiRouterToken);
  }

  public addProvider<TArguments extends readonly unknown[]>(
    Provider: ApplicationServiceProviderConstructor<TArguments>,
    ...args: TArguments
  ): void {
    this.providerRegistry.add(new Provider(this, ...args));
  }

  public addProviders(
    Providers: readonly ApplicationServiceProviderConstructor[],
  ): void {
    for (const Provider of Providers) {
      this.addProvider(Provider);
    }
  }

  public addServerPlugins(serverPlugins: ResolvedAppServerPlugins): void {
    for (const plugin of serverPlugins.plugins) {
      for (const Provider of plugin.definition.providers) {
        this.addProvider(Provider);
      }
      for (const routes of plugin.definition.apiRoutes) {
        this.addApiRoutes(routes);
      }
      for (const routes of plugin.definition.rootRoutes) {
        this.addRootRoutes(routes);
      }
    }
  }

  public addRuntimeContributions(
    runtime: ApplicationRuntimeContributions,
  ): void {
    this.addServerPlugins(runtime.plugins);
    this.addProviders(runtime.providers);
    for (const routes of runtime.apiRoutes) {
      this.addApiRoutes(routes);
    }
    for (const routes of runtime.rootRoutes) {
      this.addRootRoutes(routes);
    }
  }

  public addApiRoutes(routes: AppApiRoutes<Application>): void {
    this.assertRoutesMutable();
    this.apiRoutes.push(routes);
  }

  public addHttpMiddleware(middleware: AppHttpMiddleware<Application>): void {
    this.assertRoutesMutable();
    this.httpMiddleware.push(middleware);
  }

  public addRootRoutes(routes: AppRootRoutes<Application>): void {
    this.assertRoutesMutable();
    this.rootRoutes.push(routes);
  }

  public registerProviders(): void {
    if (this.providersRegistered) {
      return;
    }
    this.providerRegistry.registerAll();
    this.providersRegistered = true;
    if (this.usesDefaultWebSocket && this.container.has(routerToken)) {
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
    this.websocketHandler ??= this.websocketFactory(this.container);
    return this.websocketHandler;
  }

  private async startProviders(): Promise<void> {
    this.registerProviders();
    await this.providerRegistry.bootAll();
    await this.registerRoutes();
    await this.providerRegistry.startAll();
    await this.providerRegistry.readyAll();
  }

  private async registerRoutes(): Promise<void> {
    if (this.routesRegistered) {
      return;
    }

    for (const middleware of this.httpMiddleware) {
      await middleware.register(this.router, this);
    }
    for (const routes of this.apiRoutes) {
      await routes.register(this.apiRouter, this);
    }
    this.router.route('/api', this.apiRouter);
    for (const routes of this.rootRoutes) {
      await routes.register(this.router, this);
    }
    this.routesRegistered = true;
  }

  private assertRoutesMutable(): void {
    if (this.startPromise || this.routesRegistered) {
      throw new Error('Routes cannot be added after the application starts.');
    }
  }
}
