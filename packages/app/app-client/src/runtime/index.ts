import type { I18nRuntime } from '@nocobase/i18n';

import type { ClientApplication } from '../application.js';
import type { AppClientConfig, AppClientConfigFactory } from '../config.js';
import {
  createAppI18nRuntime,
  type AppClientLocaleContribution,
} from '../i18n.js';
import {
  applyClientRouteComponentOverrides,
  defineClientReactProviders,
  resolveAppClientContributions,
  type AppClientLocales,
  type AppClientPluginRegistration,
  type AppClientReactProviderDefinition,
  type AppClientReactProviders,
  type AppClientRegisteredReactProvider,
  type AppClientRegisteredDevRoute,
  type AppClientRegisteredDevRouteGroup,
  type AppClientRegisteredRoute,
  type AppClientRegisteredServiceProvider,
  type AppClientRegisteredSetting,
  type AppClientRegisteredSettingGroup,
  type AppClientRouteComponentOverrideDefinition,
  type AppClientRouteContribution,
  type AppClientRoutes,
  type AppClientServiceProviders,
  type AppClientSourceExtension,
  type ClientServiceProviderConstructor,
} from '../plugins.js';
import { readAppClientRuntimeConfig } from './browser-config.js';

export {
  readAppClientRuntimeConfig,
  type AppClientRuntimeConfigPayload,
} from './browser-config.js';

export type AppRuntimeValidator = (
  app: ClientApplication,
) => void | Promise<void>;

export interface AppRuntimeDefinition {
  readonly packageName: string;
  readonly config: AppClientConfigFactory;
  readonly serviceProviders?: AppClientServiceProviders;
  readonly reactProviders?: AppClientReactProviders;
  readonly routes?: AppClientRoutes;
  readonly locales?: AppClientLocales;
  readonly basename?: string;
  readonly plugins: readonly AppClientPluginRegistration[];
  readonly routeComponentOverrides?: readonly AppClientRouteComponentOverrideDefinition[];
  readonly sourceExtensions?: readonly AppClientSourceExtension[];
  readonly validate?: AppRuntimeValidator;
}

export interface ResolveAppRuntimeOptions {
  readonly rawConfig?: unknown;
}

export interface ResolvedAppRuntime {
  readonly config: AppClientConfig;
  readonly i18n: I18nRuntime;
  readonly basename: string;
  readonly serviceProviders: readonly AppClientRegisteredServiceProvider[];
  readonly reactProviders: readonly AppClientRegisteredReactProvider[];
  readonly routes: readonly AppClientRegisteredRoute[];
  readonly settings: readonly AppClientRegisteredSetting[];
  readonly settingGroups: readonly AppClientRegisteredSettingGroup[];
  /** Dev pages. Empty in a production build, where every dev contribution resolved to no routes. */
  readonly devRoutes: readonly AppClientRegisteredDevRoute[];
  readonly devRouteGroups: readonly AppClientRegisteredDevRouteGroup[];
  readonly validate?: AppRuntimeValidator;
}

export function defineAppRuntime(
  definition: AppRuntimeDefinition,
): AppRuntimeDefinition {
  return Object.freeze({
    ...definition,
    plugins: Object.freeze([...definition.plugins]),
    serviceProviders: freezeOptionalList(definition.serviceProviders),
    reactProviders: freezeOptionalList(definition.reactProviders),
    routes: freezeRouteDeclarations(definition.routes),
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
  options: ResolveAppRuntimeOptions = {},
): Promise<ResolvedAppRuntime> {
  const config = await definition.config({
    rawConfig:
      options.rawConfig === undefined
        ? readAppClientRuntimeConfig()
        : options.rawConfig,
    configs: Object.freeze(
      definition.plugins.flatMap((plugin) => plugin.config),
    ),
  });
  const applicationContribution = createApplicationContribution(definition);
  const pluginContributions = definition.plugins.map((plugin) => ({
    packageName: plugin.packageName,
    source: 'plugin' as const,
    routes: plugin.routes,
    reactProviders: plugin.reactProviders,
  }));
  const contributions = resolveAppClientContributions([
    applicationContribution,
    ...pluginContributions,
  ]);
  const i18n = await createAppI18nRuntime({
    contributions: collectLocaleContributions(definition),
  });
  const extensionOverrides = collectSourceExtensionRouteOverrides(
    definition.sourceExtensions ?? [],
  );

  return Object.freeze({
    config,
    i18n,
    basename: definition.basename ?? '/',
    serviceProviders: Object.freeze([
      ...registerServiceProviders(
        definition.packageName,
        'application',
        resolveServiceProviders(definition.serviceProviders),
        {},
      ),
      ...definition.plugins.flatMap((plugin) =>
        registerServiceProviders(
          plugin.packageName,
          'plugin',
          plugin.serviceProviders,
          plugin.options,
        ),
      ),
    ]),
    reactProviders: contributions.reactProviders,
    routes: applyClientRouteComponentOverrides(contributions.routes, [
      ...(definition.routeComponentOverrides ?? []),
      ...extensionOverrides,
    ]),
    settings: contributions.settings,
    settingGroups: contributions.settingGroups,
    devRoutes: contributions.devRoutes,
    devRouteGroups: contributions.devRouteGroups,
    validate: definition.validate,
  });
}

function createApplicationContribution(definition: AppRuntimeDefinition): {
  readonly packageName: string;
  readonly source: 'application';
  readonly routes: readonly AppClientRouteContribution[];
  readonly reactProviders: readonly AppClientReactProviderDefinition[];
} {
  return {
    packageName: definition.packageName,
    source: 'application',
    routes: normalizeRoutes(resolveDeclaration(definition.routes, undefined)),
    reactProviders: defineClientReactProviders(
      resolveDeclaration(definition.reactProviders, undefined) ?? [],
    ),
  };
}

function collectLocaleContributions(
  definition: AppRuntimeDefinition,
): readonly AppClientLocaleContribution[] {
  const contributions: AppClientLocaleContribution[] = [];
  if (definition.locales) {
    contributions.push({
      packageName: definition.packageName,
      source: 'application',
      locales: definition.locales,
    });
  }
  for (const plugin of definition.plugins) {
    if (plugin.locales) {
      contributions.push({
        packageName: plugin.packageName,
        source: 'plugin',
        locales: plugin.locales,
      });
    }
  }
  return Object.freeze(contributions);
}

function registerServiceProviders(
  packageName: string,
  source: 'application' | 'plugin',
  Providers: readonly ClientServiceProviderConstructor[],
  options: unknown,
): readonly AppClientRegisteredServiceProvider[] {
  return Providers.map((Provider) =>
    Object.freeze({
      Provider,
      context: Object.freeze({ packageName, source, options }),
    }),
  );
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

function resolveDeclaration<T>(
  declaration: T | ((options: void) => T) | undefined,
  options: void,
): T | undefined {
  return typeof declaration === 'function'
    ? (declaration as (value: void) => T)(options)
    : declaration;
}

function resolveServiceProviders(
  declaration: AppClientServiceProviders | undefined,
): readonly ClientServiceProviderConstructor[] {
  return (resolveDeclaration(declaration, undefined) ??
    []) as readonly ClientServiceProviderConstructor[];
}

function normalizeRoutes(
  routes:
    | AppClientRouteContribution
    | readonly AppClientRouteContribution[]
    | undefined,
): readonly AppClientRouteContribution[] {
  if (routes === undefined) {
    return Object.freeze([]);
  }
  return Object.freeze('parent' in routes ? [routes] : [...routes]);
}

function freezeOptionalList<T>(
  value: readonly T[] | ((options: void) => readonly T[]) | undefined,
): readonly T[] | ((options: void) => readonly T[]) | undefined {
  return isReadonlyArray(value) ? Object.freeze([...value]) : value;
}

function isReadonlyArray<T>(
  value: readonly T[] | ((options: void) => readonly T[]) | undefined,
): value is readonly T[] {
  return Array.isArray(value);
}

function freezeRouteDeclarations(
  value: AppClientRoutes | undefined,
): AppClientRoutes | undefined {
  if (value === undefined || typeof value === 'function') {
    return value;
  }
  return Object.freeze('parent' in value ? { ...value } : [...value]);
}
