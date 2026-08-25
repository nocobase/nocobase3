import {
  applyClientRouteComponentOverrides,
  resolveAppClientContributions,
  type AppClientApplicationLoader,
  type AppClientBootstrap,
  type AppClientContributionSource,
  type AppClientPluginLoader,
  type AppClientProviderDefinition,
  type AppClientRegisteredProvider,
  type AppClientRegisteredRoute,
  type AppClientRouteDefinition,
  type AppClientRouteComponentOverrideDefinition,
  type AppClientSourceExtension,
} from '@nocobase/app-client/plugins';
import type { AppClientRefineConfig } from '@nocobase/app-client';
import { createAppClient, type AppClient } from '@nocobase/app-sdk';
import { getPortalBase } from '@nocobase/app-portal-sdk/runtime';

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
  readonly application: AppClientApplicationLoader;
  readonly plugins: readonly AppClientPluginLoader[];
  readonly routeComponentOverrides?: readonly AppClientRouteComponentOverrideDefinition[];
  readonly sourceExtensions?: readonly AppClientSourceExtension[];
}

interface LoadedClientContribution {
  readonly packageName: string;
  readonly source: AppClientContributionSource;
  readonly bootstrap?: AppClientBootstrap;
  readonly providers?: readonly AppClientProviderDefinition[];
  readonly routes?: readonly AppClientRouteDefinition[];
}

export async function createAppRuntime(
  options: CreateAppRuntimeOptions,
): Promise<AppClientRuntime> {
  const appClient = createAppClient();
  const loadedContributions = await Promise.all([
    loadClientContribution(options.application),
    ...options.plugins.map((plugin) =>
      loadClientContribution({ ...plugin, source: 'plugin' }),
    ),
  ]);
  const refineCollector = createRefineConfigCollector({});

  for (const contribution of loadedContributions) {
    if (!contribution.bootstrap) {
      continue;
    }
    try {
      await contribution.bootstrap({
        appClient,
        packageName: contribution.packageName,
        refine: refineCollector.forContribution(contribution.packageName),
        source: contribution.source,
      });
    } catch (error) {
      throw new Error(
        `Failed to bootstrap client ${contribution.source} "${contribution.packageName}".`,
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

  const contributions = resolveAppClientContributions(loadedContributions);
  const extensionOverrides = collectSourceExtensionRouteOverrides(
    options.sourceExtensions ?? [],
  );
  const routes = applyClientRouteComponentOverrides(contributions.routes, [
    ...(options.routeComponentOverrides ?? []),
    ...extensionOverrides,
  ]);
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

function collectSourceExtensionRouteOverrides(
  extensions: readonly AppClientSourceExtension[],
): readonly AppClientRouteComponentOverrideDefinition[] {
  const names = new Set<string>();
  return extensions.flatMap((extension) => {
    const name = extension.name.trim();
    if (!name) {
      throw new Error(
        'A client source extension must define a non-empty name.',
      );
    }
    if (names.has(name)) {
      throw new Error(
        `Client source extension "${name}" is registered more than once.`,
      );
    }
    names.add(name);
    return extension.routeComponentOverrides ?? [];
  });
}

async function loadClientContribution(
  contribution:
    | AppClientApplicationLoader
    | (AppClientPluginLoader & { readonly source: 'plugin' }),
): Promise<LoadedClientContribution> {
  const [bootstrap, routes, providers] = await Promise.all([
    loadBootstrap(contribution),
    loadRoutes(contribution),
    loadProviders(contribution),
  ]);

  return Object.freeze({
    packageName: contribution.packageName,
    source: contribution.source,
    bootstrap,
    routes,
    providers,
  });
}

async function loadBootstrap(
  contribution:
    | AppClientApplicationLoader
    | (AppClientPluginLoader & { readonly source: 'plugin' }),
): Promise<AppClientBootstrap | undefined> {
  if (!contribution.loadBootstrap) {
    return undefined;
  }
  try {
    const module = await contribution.loadBootstrap();
    if (typeof module.default !== 'function') {
      throw new Error('The bootstrap entry must default-export a function.');
    }
    return module.default;
  } catch (error) {
    throw new Error(
      `Failed to load client bootstrap for ${contribution.source} "${contribution.packageName}".`,
      { cause: error },
    );
  }
}

async function loadRoutes(
  contribution:
    | AppClientApplicationLoader
    | (AppClientPluginLoader & { readonly source: 'plugin' }),
): Promise<readonly AppClientRouteDefinition[] | undefined> {
  if (!contribution.loadRoutes) {
    return undefined;
  }
  try {
    const module = await contribution.loadRoutes();
    const definitions: unknown = module.default;
    if (!isRouteDefinitions(definitions)) {
      throw new Error(
        'The client routes entry must default-export a route definition array.',
      );
    }
    return definitions;
  } catch (error) {
    throw new Error(
      `Failed to load client routes for ${contribution.source} "${contribution.packageName}".`,
      { cause: error },
    );
  }
}

async function loadProviders(
  contribution:
    | AppClientApplicationLoader
    | (AppClientPluginLoader & { readonly source: 'plugin' }),
): Promise<readonly AppClientProviderDefinition[] | undefined> {
  if (!contribution.loadProviders) {
    return undefined;
  }
  try {
    const module = await contribution.loadProviders();
    const definitions: unknown = module.default;
    if (!isProviderDefinitions(definitions)) {
      throw new Error(
        'The client providers entry must default-export a provider definition array.',
      );
    }
    return definitions;
  } catch (error) {
    throw new Error(
      `Failed to load client providers for ${contribution.source} "${contribution.packageName}".`,
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
