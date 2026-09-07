import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context, ExecutionContext, Hono, Next } from 'hono';
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
import type { AppWebSocketHandler } from '../websocket.js';
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

/** Trusted infrastructure hooks. Finalizers run after Hono resolves its response. */
export interface ApplicationHttpObserver {
  run(context: Context, next: Next): Promise<void>;
  finalize(context: Context): Promise<void>;
  failure(): void;
  /** No response exists when even Hono's error handler rejects. Release request resources. */
  abort?(context: Context): void;
}

export interface ApplicationHttpHost {
  addObserver(observer: ApplicationHttpObserver): () => void;
  /** Fixed read-only startup probe; no caller-supplied request or business handler. */
  probe(): Promise<Response>;
}

interface HttpObservation {
  readonly probe?: boolean;
  context?: Context;
  readonly observers: readonly ApplicationHttpObserver[];
}

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
    if (this.closing)
      return new Response('Application is shutting down.', { status: 503 });
    // Admission is synchronous; shutdown also drains requests waiting for startup.
    const startup = this.start();
    const dispatch = startup.then(() =>
      this.dispatchHttp(request, env, executionContext),
    );
    this.acceptedHttp.add(dispatch);
    try {
      return await dispatch;
    } finally {
      this.acceptedHttp.delete(dispatch);
    }
  };

  private dispatchHttp(
    request: Request,
    env?: unknown,
    executionContext?: ExecutionContext,
    probe: boolean = false,
  ): Promise<Response> {
    const observation: HttpObservation = {
      observers: [...this.httpObservers],
      probe,
    };
    return this.httpObservation.run(observation, async () => {
      let response: Response;
      try {
        response = await this.router.fetch(request, env, executionContext);
      } catch (error) {
        if (observation.context) {
          for (const observer of observation.observers) {
            try {
              observer.abort?.(observation.context);
            } catch {
              console.error('HTTP response observer cleanup failed.');
            }
          }
        }
        throw error;
      }
      if (observation.context) {
        if (observation.context.res !== response)
          observation.context.res = response;
        for (const observer of observation.observers) {
          try {
            await observer.finalize(observation.context);
          } catch {
            try {
              observer.failure();
            } catch {
              console.error('HTTP response observer diagnostics failed.');
            }
          }
        }
      }
      return response;
    });
  }
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
  private readonly httpObservation: AsyncLocalStorage<HttpObservation> =
    new AsyncLocalStorage<HttpObservation>();
  private readonly httpObservers: Set<ApplicationHttpObserver> = new Set();
  private closing = false;
  private shutdownPromise: Promise<void> | undefined;
  private readonly acceptedHttp: Set<Promise<Response>> = new Set();
  private startupProbeOpen = false;
  public readonly httpHost: ApplicationHttpHost = Object.freeze({
    addObserver: (observer: ApplicationHttpObserver): (() => void) =>
      this.addHttpObserver(observer),
    probe: async (): Promise<Response> => {
      if (!this.startupProbeOpen || !this.routesRegistered)
        throw new Error(
          'HTTP probe is only available during startup verification.',
        );
      return this.dispatchHttp(
        new Request('http://localhost/.nocobase/startup-probe'),
        undefined,
        undefined,
        true,
      );
    },
  });
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
    const observe = (context: Context, next: Next): Promise<void> =>
      this.observeHttpContext(context, next);
    this.addServiceProvider(
      class extends RouterProvider<Application<TConfig>> {
        public override register(): void {
          super.register();
          this.app.router.use('*', observe);
        }
      },
    );
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

  private readonly registeredPlugins: Set<string> = new Set();

  public hasPlugin(packageName: string): boolean {
    return this.registeredPlugins.has(packageName);
  }

  public addServerPlugins(serverPlugins: ResolvedAppServerPlugins): void {
    this.assertRoutesMutable();
    this.appPackageName = serverPlugins.appPackageName;
    for (const plugin of serverPlugins.plugins) {
      for (const Provider of plugin.definition.serviceProviders) {
        this.addServiceProvider(Provider);
      }
      for (const routes of plugin.definition.routes) {
        this.addRoutes(routes);
      }
      this.registeredPlugins.add(plugin.definition.packageName);
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

  /** Install before traffic starts; disposal stops new observations, not in-flight finalizers. */
  public addHttpObserver(observer: ApplicationHttpObserver): () => void {
    if (this.routesRegistered)
      throw new Error('HTTP observers must be installed before routes start.');
    if (this.httpObservers.has(observer))
      throw new Error('HTTP observer is already installed.');
    this.httpObservers.add(observer);
    return () => {
      this.httpObservers.delete(observer);
    };
  }

  private async observeHttpContext(
    context: Context,
    next: Next,
  ): Promise<void> {
    const observation = this.httpObservation.getStore();
    if (!observation) {
      await next();
      return;
    }
    observation.context = context;
    const dispatch = async (index: number): Promise<void> => {
      const observer = observation.observers[index];
      if (observer) await observer.run(context, () => dispatch(index + 1));
      else if (observation.probe)
        context.res = new Response(null, { status: 204 });
      else await next();
    };
    await dispatch(0);
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
    if (this.closing)
      return Promise.reject(new Error('Application is shutting down.'));
    this.startPromise ??= this.startServiceProviders();
    return this.startPromise;
  }

  public shutdown(): Promise<void> {
    this.closing = true;
    this.startupProbeOpen = false;
    this.shutdownPromise ??= (async (): Promise<void> => {
      if (this.startPromise) {
        try {
          await this.startPromise;
        } catch {
          /* Provider registry already cleans up failed startup. */
        }
      }
      await Promise.allSettled([...this.acceptedHttp]);
      await this.providerRegistry.shutdown();
    })();
    return this.shutdownPromise;
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
    this.startupProbeOpen = !this.closing;
    try {
      await this.providerRegistry.startAll();
      await this.providerRegistry.readyAll();
    } finally {
      this.startupProbeOpen = false;
    }
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
