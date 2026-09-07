import type { ExecutionContext, Hono } from 'hono';
import type { AppConfigAccessor } from '../config/index.js';
import { appConfig } from '../config/index.js';

import type { ConfigPaths } from '../config/index.js';
import {
  type AppHttpMiddleware,
  type AppRouteContribution,
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
import type { AppWebSocketHandler } from '@nocobase/app-websocket';
import {
  createRealtimeWebSocketHandler,
  registerRealtimeWebSocketRoutes,
} from '../realtime/websocket.js';
import { RealtimeProvider } from '../realtime/provider.js';
import type {
  AppServerPluginLocalesLoader,
  ResolvedAppServerPlugins,
} from '../plugins/index.js';
import { i18nToken, registerAppLocales } from '../i18n/index.js';

export type ApplicationFetchHandler = (
  request: Request,
  env?: unknown,
  executionContext?: ExecutionContext,
) => Response | Promise<Response>;

export type ApplicationWebSocketFactory = (
  container: ServiceResolver,
) => AppWebSocketHandler;

export type ApplicationConfig = AppConfigAccessor;

export interface ApplicationOptions<
  TConfig extends ApplicationConfig = ApplicationConfig,
> {
  readonly config: TConfig;
  readonly mode?: 'standalone' | 'embedded';
  readonly paths: ConfigPaths;
  readonly websocket?: ApplicationWebSocketFactory;
}

export type ApplicationServiceProviderConstructor<
  TConfig extends ApplicationConfig = ApplicationConfig,
  TArguments extends readonly unknown[] = [],
> = new (
  app: Application<TConfig>,
  ...args: TArguments
) => ServiceProviderLifecycle;

export interface ApplicationRuntimeContributions<
  TConfig extends ApplicationConfig = ApplicationConfig,
> {
  readonly plugins: ResolvedAppServerPlugins;
  readonly serviceProviders: readonly ApplicationServiceProviderConstructor<TConfig>[];
  readonly routes: readonly AppRouteContribution<Application<TConfig>>[];
}

/**
 * A composed NocoBase server application.
 *
 * The HTTP router is an application service, not the application itself.
 * Application owns its resolved config, paths, service container and provider lifecycle,
 * while fetch and websocket form its framework-neutral host boundary.
 */
export class Application<
  TConfig extends ApplicationConfig = ApplicationConfig,
> {
  public readonly config: TConfig;
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
  private readonly websocketFactory: ApplicationWebSocketFactory;
  private readonly usesDefaultWebSocket: boolean;
  private serviceProvidersRegistered = false;
  private routesRegistered = false;
  private readonly httpMiddleware: AppHttpMiddleware<Application<TConfig>>[] =
    [];
  private readonly routes: AppRouteContribution<Application<TConfig>>[] = [];
  private startPromise: Promise<void> | undefined;
  private websocketHandler: AppWebSocketHandler | undefined;
  private appPackageName: string | undefined;
  private readonly localeContributions: {
    packageName: string;
    load: AppServerPluginLocalesLoader;
  }[] = [];

  public constructor(options: ApplicationOptions<TConfig>) {
    this.config = options.config;
    this.mode = options.mode ?? 'embedded';
    this.paths = options.paths;
    this.container = new ServiceContainer();
    this.usesDefaultWebSocket = options.websocket === undefined;
    this.websocketFactory = options.websocket ?? createRealtimeWebSocketHandler;
    this.websocket = async (request, env) => {
      await this.start();
      return this.getWebSocketHandler()(request, env);
    };
    this.addServiceProvider(RouterProvider);
    if (this.usesDefaultWebSocket) {
      this.addServiceProvider(RealtimeProvider);
    }
  }

  public get appName(): string {
    return resolveAppName(this.config.get(appConfig).name);
  }

  public get publicBasePath(): string {
    return normalizeBasePath(this.config.get(appConfig).publicBasePath);
  }

  public get router(): Hono {
    return this.container.resolve(routerToken);
  }

  public addServiceProvider<TArguments extends readonly unknown[]>(
    Provider: ApplicationServiceProviderConstructor<TConfig, TArguments>,
    ...args: TArguments
  ): void {
    this.providerRegistry.add(new Provider(this, ...args));
  }

  public addServiceProviders(
    Providers: readonly ApplicationServiceProviderConstructor<TConfig>[],
  ): void {
    for (const Provider of Providers) {
      this.addServiceProvider(Provider);
    }
  }

  public addServerPlugins(serverPlugins: ResolvedAppServerPlugins): void {
    this.appPackageName = serverPlugins.appPackageName;
    for (const plugin of serverPlugins.plugins) {
      for (const Provider of plugin.definition.serviceProviders) {
        this.addServiceProvider(Provider);
      }
      for (const routes of plugin.definition.routes) {
        this.addRoutes(routes);
      }
      if (plugin.definition.locales) {
        this.localeContributions.push({
          packageName: plugin.definition.packageName,
          load: plugin.definition.locales,
        });
      }
    }
  }

  public addRuntimeContributions(
    runtime: ApplicationRuntimeContributions<TConfig>,
  ): void {
    this.addServerPlugins(runtime.plugins);
    this.addServiceProviders(runtime.serviceProviders);
    for (const routes of runtime.routes) {
      this.addRoutes(routes);
    }
  }

  public addRoutes(routes: AppRouteContribution<Application<TConfig>>): void {
    this.assertRoutesMutable();
    this.routes.push(routes);
  }

  public addHttpMiddleware(
    middleware: AppHttpMiddleware<Application<TConfig>>,
  ): void {
    this.assertRoutesMutable();
    this.httpMiddleware.push(middleware);
  }

  public registerProviders(): void {
    if (this.serviceProvidersRegistered) {
      return;
    }
    this.providerRegistry.registerAll();
    this.serviceProvidersRegistered = true;
    if (this.usesDefaultWebSocket && this.container.has(routerToken)) {
      registerRealtimeWebSocketRoutes(this.router);
    }
  }

  public start(): Promise<void> {
    this.startPromise ??= this.startServiceProviders();
    return this.startPromise;
  }

  public shutdown(): Promise<void> {
    return this.providerRegistry.shutdown();
  }

  private getWebSocketHandler(): AppWebSocketHandler {
    this.websocketHandler ??= this.websocketFactory(this.container);
    return this.websocketHandler;
  }

  private async startServiceProviders(): Promise<void> {
    this.registerProviders();
    await this.registerLocales();
    await this.providerRegistry.bootAll();
    await this.registerRoutes();
    await this.providerRegistry.startAll();
    await this.providerRegistry.readyAll();
  }

  /**
   * Registers each plugin's locale loaders against its package name and brings the runtime up.
   *
   * Only the default language is read here; another one is imported the first time a request asks for it.
   */
  private async registerLocales(): Promise<void> {
    if (!this.container.has(i18nToken)) {
      return;
    }

    const runtime = this.container.resolve(i18nToken);
    const contributions = await Promise.all(
      this.localeContributions.map(async (contribution) => ({
        packageName: contribution.packageName,
        locales: await contribution.load(),
      })),
    );
    await registerAppLocales(runtime, this.appPackageName ?? '', contributions);
  }

  private async registerRoutes(): Promise<void> {
    if (this.routesRegistered) {
      return;
    }

    for (const middleware of this.httpMiddleware) {
      await middleware.register(this.router, this);
    }
    for (const routes of this.routes) {
      const router = await routes.createRouter(this);
      this.router.route(routes.scope === 'api' ? '/api' : '/', router);
    }
    this.routesRegistered = true;
  }

  private assertRoutesMutable(): void {
    if (this.startPromise || this.routesRegistered) {
      throw new Error('Routes cannot be added after the application starts.');
    }
  }
}
