import type { I18nRuntime, LocalesModule } from '@nocobase/app-i18n';
import { createRefineI18nProvider } from '@nocobase/app-i18n/client';
import { createAppClient, type AppClient } from '@nocobase/app-sdk';

import type { AppClientRefineConfig } from '../config.js';
import {
  createAppI18nRuntime,
  type AppClientLocaleContribution,
} from '../i18n.js';
import {
  applyClientRouteComponentOverrides,
  resolveAppClientContributions,
  type AppClientBootstrap,
  type AppClientContributionLoader,
  type AppClientContributionSource,
  type AppClientPluginLoader,
  type AppClientProviderDefinition,
  type AppClientRegisteredProvider,
  type AppClientRegisteredRoute,
  type AppClientRegisteredSetting,
  type AppClientRegisteredSettingGroup,
  type AppClientRouteComponentOverrideDefinition,
  type AppClientRouteContribution,
  type AppClientSourceExtension,
} from '../plugins.js';
import { createRefineConfigCollector } from './refine-config-collector.js';

export type AppRuntimeValidator = (
  runtime: ResolvedAppRuntime,
) => void | Promise<void>;

export interface AppRuntimeDefinition extends AppClientContributionLoader {
  readonly basename?: string;
  readonly plugins: readonly AppClientPluginLoader[];
  readonly routeComponentOverrides?: readonly AppClientRouteComponentOverrideDefinition[];
  readonly sourceExtensions?: readonly AppClientSourceExtension[];
  readonly validate?: AppRuntimeValidator;
}

export interface ResolvedAppRuntime {
  readonly appClient: AppClient;
  readonly i18n: I18nRuntime;
  readonly basename: string;
  readonly refine: Readonly<AppClientRefineConfig>;
  readonly providers: readonly AppClientRegisteredProvider[];
  readonly routes: readonly AppClientRegisteredRoute[];
  readonly settings: readonly AppClientRegisteredSetting[];
  readonly settingGroups: readonly AppClientRegisteredSettingGroup[];
}

interface LoadedClientContribution {
  readonly packageName: string;
  readonly source: AppClientContributionSource;
  readonly bootstrap?: AppClientBootstrap<unknown>;
  readonly locales?: LocalesModule;
  readonly providers?: readonly AppClientProviderDefinition[];
  readonly routes?: readonly AppClientRouteContribution[];
  readonly options: unknown;
}

export function defineAppRuntime(
  definition: AppRuntimeDefinition,
): AppRuntimeDefinition {
  return Object.freeze({
    ...definition,
    plugins: Object.freeze([...definition.plugins]),
    routeComponentOverrides: definition.routeComponentOverrides
      ? Object.freeze([...definition.routeComponentOverrides])
      : undefined,
    sourceExtensions: definition.sourceExtensions
      ? Object.freeze([...definition.sourceExtensions])
      : undefined,
  });
}

export async function resolveAppRuntime(
  definition: AppRuntimeDefinition,
): Promise<ResolvedAppRuntime> {
  const appClient = createAppClient();
  const application = { ...definition, source: 'application' as const };
  const loadedContributions = await Promise.all([
    loadClientContribution(application),
    ...definition.plugins.map((plugin) =>
      loadClientContribution({ ...plugin, source: 'plugin' }),
    ),
  ]);
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

  const contributions = resolveAppClientContributions(loadedContributions);
  const extensionOverrides = collectSourceExtensionRouteOverrides(
    definition.sourceExtensions ?? [],
  );
  const runtime: ResolvedAppRuntime = Object.freeze({
    appClient,
    i18n,
    basename: definition.basename ?? '/',
    refine: refineCollector.finalize(),
    providers: contributions.providers,
    routes: applyClientRouteComponentOverrides(contributions.routes, [
      ...(definition.routeComponentOverrides ?? []),
      ...extensionOverrides,
    ]),
    settings: contributions.settings,
    settingGroups: contributions.settingGroups,
  });

  await definition.validate?.(runtime);
  return runtime;
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

type ResolvableContribution = AppClientContributionLoader & {
  readonly source: AppClientContributionSource;
};

async function loadClientContribution(
  contribution: ResolvableContribution,
): Promise<LoadedClientContribution> {
  const [bootstrap, routes, providers, locales] = await Promise.all([
    loadBootstrap(contribution),
    loadRoutes(contribution),
    loadProviders(contribution),
    loadLocales(contribution),
  ]);

  return Object.freeze({
    packageName: contribution.packageName,
    source: contribution.source,
    bootstrap,
    routes,
    providers,
    locales,
    options: contribution.options ?? {},
  });
}

async function loadLocales(
  contribution: ResolvableContribution,
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
  contribution: ResolvableContribution,
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
  contribution: ResolvableContribution,
): Promise<readonly AppClientRouteContribution[] | undefined> {
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
            ) =>
              AppClientRouteContribution | readonly AppClientRouteContribution[]
          )(contribution.options ?? {})
        : exported;
    const normalized: unknown = Array.isArray(definitions)
      ? definitions
      : [definitions];
    if (!isRouteContributions(normalized)) {
      throw new Error(
        'The client routes entry must default-export a Route contribution, a Route contribution array, or a function returning either.',
      );
    }
    return normalized;
  } catch (error) {
    throw new Error(
      `Failed to load client routes for ${contribution.source} "${contribution.packageName}".`,
      { cause: error },
    );
  }
}

async function loadProviders(
  contribution: ResolvableContribution,
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

function isRouteContributions(
  value: unknown,
): value is readonly AppClientRouteContribution[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        ((item as { readonly parent?: unknown }).parent === 'app' ||
          (item as { readonly parent?: unknown }).parent === 'settings') &&
        Array.isArray((item as { readonly routes?: unknown }).routes),
    )
  );
}

function isProviderDefinitions(
  value: unknown,
): value is readonly AppClientProviderDefinition[] {
  return Array.isArray(value);
}
