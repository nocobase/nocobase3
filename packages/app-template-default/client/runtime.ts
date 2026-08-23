import {
  applyClientRouteComponentOverrides,
  resolveAppClientContributions,
  type AppClientPluginBootstrap,
  type AppClientPluginLoader,
  type AppClientProviderDefinition,
  type AppClientRegisteredProvider,
  type AppClientRegisteredRoute,
  type AppClientRouteDefinition,
  type AppClientRouteComponentOverrideDefinition,
} from '@nocobase/app-client/plugins';
import type { AppClientRefineConfig } from '@nocobase/app-client';
import { createAppClient, type AppClient } from '@nocobase/app-sdk';
import { getPortalBase } from '@nocobase/portal-sdk/runtime';

import { createRefineConfigCollector } from './refine-runtime';

export type AppClientRuntimeRefineConfig = Readonly<AppClientRefineConfig> & {
  readonly authProvider: NonNullable<AppClientRefineConfig['authProvider']>;
  readonly dataProvider: NonNullable<AppClientRefineConfig['dataProvider']>;
};

export interface AppClientRuntime {
  readonly appClient: AppClient;
  readonly basename: string;
  readonly refine: AppClientRuntimeRefineConfig;
  readonly providers: readonly AppClientRegisteredProvider[];
  readonly routes: readonly AppClientRegisteredRoute[];
}

export interface CreateAppRuntimeOptions {
  readonly plugins: readonly AppClientPluginLoader[];
  readonly routeComponentOverrides?: readonly AppClientRouteComponentOverrideDefinition[];
}

interface LoadedClientPlugin {
  readonly packageName: string;
  readonly bootstrap?: AppClientPluginBootstrap;
  readonly providers?: readonly AppClientProviderDefinition[];
  readonly routes?: readonly AppClientRouteDefinition[];
}

export async function createAppRuntime(
  options: CreateAppRuntimeOptions,
): Promise<AppClientRuntime> {
  const appClient = createAppClient();
  const loadedPlugins = await Promise.all(
    options.plugins.map(loadClientPlugin),
  );
  const refineCollector = createRefineConfigCollector({
    options: {
      title: {
        text: 'NocoBase',
      },
    },
  });

  for (const plugin of loadedPlugins) {
    if (!plugin.bootstrap) {
      continue;
    }
    try {
      await plugin.bootstrap({
        appClient,
        packageName: plugin.packageName,
        refine: refineCollector.forPlugin(plugin.packageName),
      });
    } catch (error) {
      throw new Error(
        `Failed to bootstrap client plugin "${plugin.packageName}".`,
        { cause: error },
      );
    }
  }

  const refine = refineCollector.finalize();
  if (!refine.authProvider) {
    throw new Error(
      'Default App requires an enabled client plugin that registers an auth provider.',
    );
  }
  if (!refine.dataProvider) {
    throw new Error(
      'Default App requires an enabled client plugin that registers a data provider.',
    );
  }

  const contributions = resolveAppClientContributions(loadedPlugins);
  const routes = applyClientRouteComponentOverrides(
    contributions.routes,
    options.routeComponentOverrides ?? [],
  );
  if (
    !routes.some(
      (route) =>
        route.path.toLowerCase() === '/login' && route.auth === 'guest',
    )
  ) {
    throw new Error(
      'Default App requires an enabled client plugin that registers a guest /login route.',
    );
  }
  return Object.freeze({
    appClient,
    basename: getPortalBase(),
    refine: Object.freeze({
      ...refine,
      authProvider: refine.authProvider,
      dataProvider: refine.dataProvider,
    }),
    providers: contributions.providers,
    routes,
  });
}

async function loadClientPlugin(
  plugin: AppClientPluginLoader,
): Promise<LoadedClientPlugin> {
  const [bootstrap, routes, providers] = await Promise.all([
    loadBootstrap(plugin),
    loadRoutes(plugin),
    loadProviders(plugin),
  ]);

  return Object.freeze({
    packageName: plugin.packageName,
    bootstrap,
    routes,
    providers,
  });
}

async function loadBootstrap(
  plugin: AppClientPluginLoader,
): Promise<AppClientPluginBootstrap | undefined> {
  if (!plugin.loadBootstrap) {
    return undefined;
  }
  try {
    const module = await plugin.loadBootstrap();
    if (typeof module.default !== 'function') {
      throw new Error('The bootstrap entry must default-export a function.');
    }
    return module.default;
  } catch (error) {
    throw new Error(
      `Failed to load client bootstrap for plugin "${plugin.packageName}".`,
      { cause: error },
    );
  }
}

async function loadRoutes(
  plugin: AppClientPluginLoader,
): Promise<readonly AppClientRouteDefinition[] | undefined> {
  if (!plugin.loadRoutes) {
    return undefined;
  }
  try {
    const module = await plugin.loadRoutes();
    const definitions: unknown = module.default;
    if (!isRouteDefinitions(definitions)) {
      throw new Error(
        'The client routes entry must default-export a route definition array.',
      );
    }
    return definitions;
  } catch (error) {
    throw new Error(
      `Failed to load client routes for plugin "${plugin.packageName}".`,
      { cause: error },
    );
  }
}

async function loadProviders(
  plugin: AppClientPluginLoader,
): Promise<readonly AppClientProviderDefinition[] | undefined> {
  if (!plugin.loadProviders) {
    return undefined;
  }
  try {
    const module = await plugin.loadProviders();
    const definitions: unknown = module.default;
    if (!isProviderDefinitions(definitions)) {
      throw new Error(
        'The client providers entry must default-export a provider definition array.',
      );
    }
    return definitions;
  } catch (error) {
    throw new Error(
      `Failed to load client providers for plugin "${plugin.packageName}".`,
      { cause: error },
    );
  }
}

function isRouteDefinitions(
  value: unknown,
): value is readonly AppClientRouteDefinition[] {
  return Array.isArray(value);
}

function isProviderDefinitions(
  value: unknown,
): value is readonly AppClientProviderDefinition[] {
  return Array.isArray(value);
}
