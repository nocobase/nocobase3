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
  type AppClientRegisteredSetting,
  type AppClientRegisteredSettingGroup,
  type AppClientRouteDefinition,
  type AppClientSettingDefinition,
  type AppClientRouteComponentOverrideDefinition,
  type AppClientSourceExtension,
} from '@nocobase/app-client/plugins';
import {
  createAppI18nRuntime,
  type AppClientLocaleContribution,
} from '@nocobase/app-client';
import { createRefineI18nProvider } from '@nocobase/app-i18n/client';
import type { AppClientRefineConfig } from '@nocobase/app-client';
import type { I18nRuntime, LocalesModule } from '@nocobase/app-i18n';
import { createAppClient, type AppClient } from '@nocobase/app-sdk';
import { getPortalBase } from '@nocobase/app-portal-sdk/runtime';

import { createRefineConfigCollector } from './refine-runtime';

export type AppClientRuntimeRefineConfig = Readonly<AppClientRefineConfig> & {
  readonly authProvider: NonNullable<AppClientRefineConfig['authProvider']>;
  readonly dataProvider: NonNullable<AppClientRefineConfig['dataProvider']>;
};

export interface AppClientRuntime {
  readonly appClient: AppClient;
  readonly i18n: I18nRuntime;
  readonly basename: string;
  readonly refine: AppClientRuntimeRefineConfig;
  readonly providers: readonly AppClientRegisteredProvider[];
  readonly routes: readonly AppClientRegisteredRoute[];
  readonly settings: readonly AppClientRegisteredSetting[];
  readonly settingGroups: readonly AppClientRegisteredSettingGroup[];
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
  readonly bootstrap?: AppClientBootstrap<unknown>;
  readonly locales?: LocalesModule;
  readonly providers?: readonly AppClientProviderDefinition[];
  readonly routes?: readonly AppClientRouteDefinition[];
  readonly settings?: readonly AppClientSettingDefinition[];
  readonly options: unknown;
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
  // i18n comes up before anything renders, so the first frame is already in the right language and no loading state
  // is needed. Only the starting locale is fetched; the rest wait until someone switches.
  const i18n = await createAppI18nRuntime({
    contributions: loadedContributions.flatMap(
      (contribution): AppClientLocaleContribution[] =>
        contribution.locales
          ? [
              {
                packageName: contribution.packageName,
                source: contribution.source,
                locales: contribution.locales,
              },
            ]
          : [],
    ),
  });
  // Supplied as a default rather than set outright, so a plugin that registers its own i18nProvider still wins.
  const refineCollector = createRefineConfigCollector({
    i18nProvider: createRefineI18nProvider(i18n),
  });

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
        options: contribution.options,
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
    i18n,
    basename: getPortalBase(),
    refine: Object.freeze({
      ...refine,
      authProvider: refine.authProvider,
      dataProvider: refine.dataProvider,
    }),
    providers: contributions.providers,
    routes,
    settings: contributions.settings,
    settingGroups: contributions.settingGroups,
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
  const [bootstrap, routes, settings, providers, locales] = await Promise.all([
    loadBootstrap(contribution),
    loadRoutes(contribution),
    loadSettings(contribution),
    loadProviders(contribution),
    loadLocales(contribution),
  ]);

  return Object.freeze({
    packageName: contribution.packageName,
    source: contribution.source,
    bootstrap,
    routes,
    settings,
    providers,
    locales,
    options: contribution.options ?? {},
  });
}

async function loadLocales(
  contribution:
    | AppClientApplicationLoader
    | (AppClientPluginLoader & { readonly source: 'plugin' }),
): Promise<LocalesModule | undefined> {
  if (!contribution.locales) {
    return undefined;
  }
  try {
    return await contribution.locales();
  } catch (error) {
    throw new Error(
      `Failed to load client locales for ${contribution.source} "${contribution.packageName}".`,
      { cause: error },
    );
  }
}

async function loadBootstrap(
  contribution:
    | AppClientApplicationLoader
    | (AppClientPluginLoader & { readonly source: 'plugin' }),
): Promise<AppClientBootstrap<unknown> | undefined> {
  if (!contribution.bootstrap) {
    return undefined;
  }
  try {
    const module = await contribution.bootstrap();
    if (typeof module.default !== 'function') {
      throw new Error('The bootstrap entry must default-export a function.');
    }
    return module.default as AppClientBootstrap<unknown>;
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
  if (!contribution.routes) {
    return undefined;
  }
  try {
    const module = await contribution.routes();
    const exported: unknown = module.default;
    const definitions: unknown =
      typeof exported === 'function'
        ? (
            exported as (
              options: unknown,
            ) => readonly AppClientRouteDefinition[]
          )(contribution.options ?? {})
        : exported;
    if (!isRouteDefinitions(definitions)) {
      throw new Error(
        'The client routes entry must default-export a route definition array, or a function returning one.',
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

async function loadSettings(
  contribution:
    | AppClientApplicationLoader
    | (AppClientPluginLoader & { readonly source: 'plugin' }),
): Promise<readonly AppClientSettingDefinition[] | undefined> {
  if (!contribution.settings) {
    return undefined;
  }
  try {
    const module = await contribution.settings();
    const exported: unknown = module.default;
    const definitions: unknown =
      typeof exported === 'function'
        ? (
            exported as (
              options: unknown,
            ) => readonly AppClientSettingDefinition[]
          )(contribution.options ?? {})
        : exported;
    if (!isSettingDefinitions(definitions)) {
      throw new Error(
        'The client settings entry must default-export a setting definition array, or a function returning one.',
      );
    }
    return definitions;
  } catch (error) {
    throw new Error(
      `Failed to load client settings for ${contribution.source} "${contribution.packageName}".`,
      { cause: error },
    );
  }
}

async function loadProviders(
  contribution:
    | AppClientApplicationLoader
    | (AppClientPluginLoader & { readonly source: 'plugin' }),
): Promise<readonly AppClientProviderDefinition[] | undefined> {
  if (!contribution.providers) {
    return undefined;
  }
  try {
    const module = await contribution.providers();
    const exported: unknown = module.default;
    const definitions: unknown =
      typeof exported === 'function'
        ? (
            exported as (
              options: unknown,
            ) => readonly AppClientProviderDefinition[]
          )(contribution.options ?? {})
        : exported;
    if (!isProviderDefinitions(definitions)) {
      throw new Error(
        'The client providers entry must default-export a provider definition array, or a function returning one.',
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

function isSettingDefinitions(
  value: unknown,
): value is readonly AppClientSettingDefinition[] {
  return Array.isArray(value);
}

function isProviderDefinitions(
  value: unknown,
): value is readonly AppClientProviderDefinition[] {
  return Array.isArray(value);
}
