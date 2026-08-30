import type { Application } from '../application/index.js';
import {
  resolveAppRuntime,
  type AppRuntimeDefinition,
  type ResolvedAppRuntime,
} from '../runtime/definition.js';
import type { AppConfigToken } from '../config/index.js';
import type { NodeServerConfig } from './config.js';
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

export type CreateStandaloneRuntimeScopeOptions = CreateStandaloneScopeOptions;

export interface StandaloneServerListenOptions {
  readonly hostname: string;
  readonly port: number;
  readonly startLog: boolean;
}

export interface StandaloneServer extends ClosableNodeAppServer {
  readonly application: Application;
  readonly listenOptions: StandaloneServerListenOptions;
  readonly signal: AbortSignal;
}

export type StandaloneServerFactory = (scope: AppScope) => Promise<Application>;

export interface StandaloneApplicationDefinition {
  readonly rootDir: string;
  readonly appRuntime: AppRuntimeDefinition;
  readonly serverConfig?: AppConfigToken<NodeServerConfig>;
  readonly createServer: StandaloneServerFactory;
}

export type StandaloneServerOptions = CreateStandaloneRuntimeScopeOptions & {
  readonly viteDevUrl?: string | false;
};

export type CreateStandaloneServerOptions = StandaloneApplicationDefinition &
  StandaloneServerOptions;

export interface DefinedStandaloneServer {
  readonly create: (
    options?: StandaloneServerOptions,
  ) => Promise<StandaloneServer>;
  readonly start: (options?: StandaloneServerOptions) => void;
}

export async function createStandaloneServer(
  options: CreateStandaloneServerOptions,
): Promise<StandaloneServer> {
  const {
    appRuntime: _appRuntime,
    createServer,
    serverConfig,
    ...serverOptions
  } = options;
  const scope = createStandaloneRuntimeScope(
    resolveStandaloneServerScopeOptions(serverOptions),
  );

  try {
    const application = await createServer(scope);
    const mounted = createPublicBasePathAdapter(
      application,
      application.publicBasePath,
    );
    const serverConfigValue = serverConfig
      ? application.config.get(serverConfig)
      : {
          host: '127.0.0.1',
          port: 13000,
          startLog: true,
          viteDevUrl: undefined,
        };
    const listenOptions: StandaloneServerListenOptions = {
      hostname: serverConfigValue.host,
      port: serverConfigValue.port,
      startLog: serverConfigValue.startLog,
    };
    const server: StandaloneServer = {
      application,
      close: (): Promise<void> => scope.destroy(),
      fetch: mounted.fetch,
      listenOptions,
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

export function startServer(options: CreateStandaloneServerOptions): void {
  const startPromise = startStandaloneServer(options);
  startPromise.catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export function defineStandaloneServer(
  definition: StandaloneApplicationDefinition,
): DefinedStandaloneServer {
  return {
    create: (
      options: StandaloneServerOptions = {},
    ): Promise<StandaloneServer> =>
      createStandaloneServer({
        ...options,
        ...definition,
        rootDir: options.rootDir ?? definition.rootDir,
      }),
    start: (options: StandaloneServerOptions = {}): void => {
      startServer({
        ...options,
        ...definition,
        rootDir: options.rootDir ?? definition.rootDir,
      });
    },
  };
}

export function createStandaloneRuntimeScope(
  options: CreateStandaloneRuntimeScopeOptions,
): StandaloneAppScope {
  return createStandaloneScope(options);
}

export function resolveStandaloneAppRuntime(
  definition: AppRuntimeDefinition,
  options: CreateStandaloneRuntimeScopeOptions,
): Promise<ResolvedAppRuntime> {
  return resolveAppRuntime(definition, createStandaloneRuntimeScope(options));
}

async function startStandaloneServer(
  options: CreateStandaloneServerOptions,
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

function resolveStandaloneServerScopeOptions(
  options: StandaloneServerOptions,
): CreateStandaloneRuntimeScopeOptions {
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
