import type { Application } from '../application/index.js';
import {
  resolveAppRuntime,
  resolveAppRuntimeConfigSection,
  type AppRuntimeConfig,
  type AppRuntimeConfigSections,
  type AppRuntimeDefinition,
  type ResolvedAppRuntime,
  type ResolvedAppRuntimeConfigSection,
} from '../runtime/definition.js';
import { createPublicBasePathAdapter } from '../runtime/mount.js';
import type { AppScope } from '../runtime/types.js';
import {
  createStandaloneScope,
  type CreateStandaloneScopeOptions,
  type StandaloneAppScope,
} from './scope.js';
import {
  type ClosableNodeAppServer,
  disposeAfterStartupFailure,
  startNodeAppServer,
} from './server.js';

export type CreateStandaloneRuntimeScopeOptions<TConfig = unknown> =
  CreateStandaloneScopeOptions<TConfig>;

export interface NodeStandaloneAppConfig extends AppRuntimeConfig {
  readonly server: {
    readonly host: string;
    readonly port: number;
    readonly startLog: boolean;
  };
}

export interface StandaloneServerListenOptions {
  readonly hostname: string;
  readonly port: number;
  readonly startLog: boolean;
}

export interface StandaloneServer<
  TConfig extends NodeStandaloneAppConfig,
> extends ClosableNodeAppServer {
  readonly application: Application<TConfig>;
  readonly listenOptions: StandaloneServerListenOptions;
  readonly signal: AbortSignal;
}

export type StandaloneServerFactory<
  TConfig extends NodeStandaloneAppConfig,
  TScopeConfig,
> = (scope: AppScope<TScopeConfig>) => Promise<Application<TConfig>>;

export interface StandaloneApplicationDefinition<
  TConfig extends NodeStandaloneAppConfig,
  TScopeConfig,
> {
  readonly rootDir: string;
  readonly appRuntime: AppRuntimeDefinition<TConfig, TScopeConfig>;
  readonly createServer: StandaloneServerFactory<TConfig, TScopeConfig>;
}

export type StandaloneServerOptions<TScopeConfig = unknown> =
  CreateStandaloneRuntimeScopeOptions<TScopeConfig> & {
    readonly viteDevUrl?: string | false;
  };

export type CreateStandaloneServerOptions<
  TConfig extends NodeStandaloneAppConfig,
  TScopeConfig,
> = StandaloneApplicationDefinition<TConfig, TScopeConfig> &
  StandaloneServerOptions<TScopeConfig>;

export interface DefinedStandaloneServer<
  TConfig extends NodeStandaloneAppConfig,
  TScopeConfig,
> {
  readonly create: (
    options?: StandaloneServerOptions<TScopeConfig>,
  ) => Promise<StandaloneServer<TConfig>>;
  readonly start: (options?: StandaloneServerOptions<TScopeConfig>) => void;
}

export async function createStandaloneServer<
  TConfig extends NodeStandaloneAppConfig,
  TScopeConfig,
>(
  options: CreateStandaloneServerOptions<TConfig, TScopeConfig>,
): Promise<StandaloneServer<TConfig>> {
  const { appRuntime: _appRuntime, createServer, ...serverOptions } = options;
  const scope = createStandaloneRuntimeScope(
    resolveStandaloneServerScopeOptions(serverOptions),
  );

  try {
    const application = await createServer(scope);
    const mounted = createPublicBasePathAdapter(
      application,
      application.publicBasePath,
    );
    const server: StandaloneServer<TConfig> = {
      application,
      close: (): Promise<void> => scope.destroy(),
      fetch: mounted.fetch,
      listenOptions: {
        hostname: application.config.server.host,
        port: application.config.server.port,
        startLog: application.config.server.startLog,
      },
      signal: scope.signal,
    };

    if (mounted.websocket) {
      server.websocket = mounted.websocket;
    }

    return server;
  } catch (error) {
    return disposeAfterStartupFailure(() => scope.destroy(), error);
  }
}

export function startServer<
  TConfig extends NodeStandaloneAppConfig,
  TScopeConfig,
>(options: CreateStandaloneServerOptions<TConfig, TScopeConfig>): void {
  const startPromise = startStandaloneServer(options);
  startPromise.catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export function defineStandaloneServer<
  TConfig extends NodeStandaloneAppConfig,
  TScopeConfig,
>(
  definition: StandaloneApplicationDefinition<TConfig, TScopeConfig>,
): DefinedStandaloneServer<TConfig, TScopeConfig> {
  return {
    create: (
      options: StandaloneServerOptions<TScopeConfig> = {},
    ): Promise<StandaloneServer<TConfig>> =>
      createStandaloneServer({
        ...options,
        ...definition,
        rootDir: options.rootDir ?? definition.rootDir,
      }),
    start: (options: StandaloneServerOptions<TScopeConfig> = {}): void => {
      startServer({
        ...options,
        ...definition,
        rootDir: options.rootDir ?? definition.rootDir,
      });
    },
  };
}

export function createStandaloneRuntimeScope<TScopeConfig = unknown>(
  options: CreateStandaloneRuntimeScopeOptions<TScopeConfig>,
): StandaloneAppScope<TScopeConfig> {
  return createStandaloneScope(options);
}

export function resolveStandaloneAppRuntime<
  TConfig extends AppRuntimeConfig,
  TScopeConfig = unknown,
>(
  definition: AppRuntimeDefinition<TConfig, TScopeConfig>,
  options: CreateStandaloneRuntimeScopeOptions<TScopeConfig>,
): ResolvedAppRuntime<TConfig, TScopeConfig> {
  return resolveAppRuntime(definition, createStandaloneRuntimeScope(options));
}

export function resolveStandaloneAppRuntimeConfigSection<
  TConfig extends AppRuntimeConfig,
  TScopeConfig,
  TKey extends keyof AppRuntimeConfigSections<TConfig>,
>(
  definition: AppRuntimeDefinition<TConfig, TScopeConfig>,
  options: CreateStandaloneRuntimeScopeOptions<TScopeConfig>,
  key: TKey,
): ResolvedAppRuntimeConfigSection<TConfig, TScopeConfig, TKey> {
  return resolveAppRuntimeConfigSection(
    definition,
    createStandaloneRuntimeScope(options),
    key,
  );
}

async function startStandaloneServer<
  TConfig extends NodeStandaloneAppConfig,
  TScopeConfig,
>(
  options: CreateStandaloneServerOptions<TConfig, TScopeConfig>,
): Promise<void> {
  const app = await createStandaloneServer(options);

  try {
    await startNodeAppServer(app, {
      hostname: app.listenOptions.hostname,
      port: app.listenOptions.port,
      onListen: (info): void => {
        if (!app.listenOptions.startLog) {
          return;
        }

        console.log(
          `App server listening on http://${info.address}:${info.port}`,
        );
      },
    });
  } catch (error) {
    await disposeAfterStartupFailure(() => app.close(), error);
  }
}

function resolveStandaloneServerScopeOptions<TScopeConfig>(
  options: StandaloneServerOptions<TScopeConfig>,
): CreateStandaloneRuntimeScopeOptions<TScopeConfig> {
  const { viteDevUrl, ...scopeOptions } = options;
  if (viteDevUrl === undefined) {
    return scopeOptions;
  }

  return {
    ...scopeOptions,
    env: {
      ...scopeOptions.env,
      APP_VITE_DEV_URL: viteDevUrl === false ? 'false' : viteDevUrl,
    },
  };
}
