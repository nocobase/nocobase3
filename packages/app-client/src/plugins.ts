import type { LocalesModule } from '@nocobase/app-i18n';
import type { AppClient } from '@nocobase/app-sdk';
import type { ComponentType } from 'react';

import type { AppClientProvider, AppClientRefineConfig } from './config.js';

const CONTRIBUTION_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
// A setting id is one URL segment. Nesting comes from the tree, not from slashes inside an id.
const SETTING_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const SETTINGS_PATH_PREFIX = '/settings';
const RESERVED_APPLICATION_ROUTE_PATHS = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
]);

export type AppClientRouteAuth = 'required' | 'guest' | 'optional';

export type AppClientContributionSource = 'application' | 'plugin';

export type AppClientProviderLayer = 'root' | 'application' | 'extension';

export interface AppClientRouteComponentModule {
  default: ComponentType;
}

export type AppClientRouteComponentLoader =
  () => Promise<AppClientRouteComponentModule>;

export interface AppClientRouteDefinition {
  readonly name: string;
  readonly path: string;
  readonly auth?: AppClientRouteAuth;
  /** Authorization checked before the route component is loaded. */
  readonly access?: {
    readonly resource: string;
    readonly action: string;
  };
  readonly componentLoader: AppClientRouteComponentLoader;
}

export interface AppClientRegisteredRoute extends AppClientRouteDefinition {
  readonly auth: AppClientRouteAuth;
  readonly id: string;
  readonly packageName: string;
  readonly source: AppClientContributionSource;
}

/**
 * An icon component for a settings entry. It takes a `className` so the application controls sizing rather than the
 * plugin, which is what keeps icons consistent across plugins. A lucide-react icon satisfies this directly.
 */
export type AppClientSettingIcon = ComponentType<{
  readonly className?: string;
}>;

/**
 * Navigation metadata for a child Route of the built-in Settings Route.
 */
export interface AppClientSettingsRouteNavigation {
  readonly title: string;
  readonly icon?: AppClientSettingIcon;
}

export interface AppClientSettingsRoutePageDefinition {
  readonly name: string;
  /** Path relative to the built-in Settings Route. */
  readonly path: string;
  readonly navigation?: AppClientSettingsRouteNavigation;
  /** Authorization checked before the page is loaded. */
  readonly access?: {
    readonly resource: string;
    readonly action: string;
  };
  readonly componentLoader: AppClientRouteComponentLoader;
}

/**
 * A group of settings pages. It carries the icon and title once for the whole section, so its children do not repeat
 * them. Groups nest one level: a group's children are pages, not further groups.
 */
export interface AppClientSettingsRouteGroupDefinition {
  readonly name: string;
  /** Path segment relative to the built-in Settings Route. */
  readonly path: string;
  readonly navigation: AppClientSettingsRouteNavigation;
  readonly children: readonly AppClientSettingsRoutePageDefinition[];
}

/** A child Route contributed to the built-in Settings Route. */
export type AppClientSettingsRouteDefinition =
  AppClientSettingsRoutePageDefinition | AppClientSettingsRouteGroupDefinition;

export function isAppClientSettingsRouteGroup(
  route: AppClientSettingsRouteDefinition,
): route is AppClientSettingsRouteGroupDefinition {
  return Array.isArray(
    (route as AppClientSettingsRouteGroupDefinition).children,
  );
}

/** A resolved Settings page, flattened out of the Route tree with its full path and optional navigation group. */
export interface AppClientRegisteredSetting {
  /** The application path produced from the built-in Settings Route and the contributed relative path. */
  readonly path: string;
  readonly id: string;
  readonly title: string;
  readonly navigation: boolean;
  readonly icon?: AppClientSettingIcon;
  readonly access?: { readonly resource: string; readonly action: string };
  readonly pageLoader: AppClientRouteComponentLoader;
  readonly groupId?: string;
  readonly packageName: string;
  readonly source: AppClientContributionSource;
}

/** A resolved group, holding the pages the current contribution put under it. */
export interface AppClientRegisteredSettingGroup {
  readonly id: string;
  readonly title: string;
  readonly icon?: AppClientSettingIcon;
  readonly packageName: string;
  readonly source: AppClientContributionSource;
  readonly settings: readonly AppClientRegisteredSetting[];
}

export interface AppClientAppRoutesContribution {
  readonly parent: 'app';
  readonly routes: readonly AppClientRouteDefinition[];
}

export interface AppClientSettingsRoutesContribution {
  readonly parent: 'settings';
  readonly routes: readonly AppClientSettingsRouteDefinition[];
}

export type AppClientRouteContribution =
  AppClientAppRoutesContribution | AppClientSettingsRoutesContribution;

export interface AppClientRouteComponentOverrideDefinition {
  readonly routeId: string;
  readonly componentLoader: AppClientRouteComponentLoader;
  readonly componentEntry?: string;
}

export interface AppClientSourceExtension {
  readonly name: string;
  readonly routeComponentOverrides?: readonly AppClientRouteComponentOverrideDefinition[];
}

export interface AppClientProviderDefinition {
  readonly name: string;
  readonly component: AppClientProvider;
  readonly layer?: AppClientProviderLayer;
  readonly before?: readonly string[];
  readonly after?: readonly string[];
}

export interface AppClientRegisteredProvider extends AppClientProviderDefinition {
  readonly id: string;
  readonly layer: AppClientProviderLayer;
  readonly packageName: string;
  readonly source: AppClientContributionSource;
}

export type AppClientRefineSetterValue<
  Property extends keyof AppClientRefineConfig,
> = Property extends 'children'
  ? Exclude<AppClientRefineConfig[Property], undefined>
  : NonNullable<AppClientRefineConfig[Property]>;

export type AppClientRefineSetters = {
  [
    Property in keyof AppClientRefineConfig as `set${Capitalize<
      Property & string
    >}`
  ]-?: (value: AppClientRefineSetterValue<Property>) => void;
};

export type AppClientRefineRegistry = AppClientRefineSetters & {
  addResources(
    resources: NonNullable<AppClientRefineConfig['resources']>,
  ): void;
  addLiveEventHandler(
    handler: NonNullable<AppClientRefineConfig['onLiveEvent']>,
  ): void;
};

export interface AppClientBootstrapContext<TOptions = unknown> {
  readonly appClient: AppClient;
  readonly packageName: string;
  readonly refine: AppClientRefineRegistry;
  readonly source: AppClientContributionSource;
  /** Options the application passed to this plugin. Empty object when none. */
  readonly options: TOptions;
}

export type AppClientBootstrap<TOptions = unknown> = (
  context: AppClientBootstrapContext<TOptions>,
) => void | Promise<void>;

export type AppClientPluginBootstrapContext<TOptions = unknown> =
  AppClientBootstrapContext<TOptions>;

export type AppClientPluginBootstrap<TOptions = unknown> =
  AppClientBootstrap<TOptions>;

export interface AppClientBootstrapModule {
  default: AppClientBootstrap<never>;
}

export type AppClientPluginBootstrapModule = AppClientBootstrapModule;

export type AppClientRoutesModuleDefault =
  | AppClientRouteContribution
  | readonly AppClientRouteContribution[]
  | ((
      options: never,
    ) => AppClientRouteContribution | readonly AppClientRouteContribution[]);

export type AppClientProvidersModuleDefault =
  | readonly AppClientProviderDefinition[]
  | ((options: never) => readonly AppClientProviderDefinition[]);

export interface AppClientRoutesModule {
  default: AppClientRoutesModuleDefault;
}

export interface AppClientProvidersModule {
  default: AppClientProvidersModuleDefault;
}

export type AppClientBootstrapLoader = () => Promise<AppClientBootstrapModule>;

export type AppClientPluginBootstrapLoader = AppClientBootstrapLoader;

export type AppClientRoutesLoader = () => Promise<AppClientRoutesModule>;

export type AppClientProvidersLoader = () => Promise<AppClientProvidersModule>;

/** Loads a package's `locales/index.ts`, whose default export maps each locale to a lazy import of its resources. */
export type AppClientLocalesLoader = () => Promise<LocalesModule>;

export interface AppClientContributionLoader {
  readonly packageName: string;
  readonly bootstrap?: AppClientBootstrapLoader;
  readonly routes?: AppClientRoutesLoader;
  readonly providers?: AppClientProvidersLoader;
  readonly locales?: AppClientLocalesLoader;
  /** Options forwarded to the bootstrap context and contribution factories. */
  readonly options?: unknown;
}

export interface AppClientPluginLoader extends AppClientContributionLoader {
  readonly source?: 'plugin';
}

export interface AppClientContributions {
  readonly packageName: string;
  readonly source?: AppClientContributionSource;
  readonly routes?:
    AppClientRouteContribution | readonly AppClientRouteContribution[];
  readonly providers?: readonly AppClientProviderDefinition[];
}

export type AppClientPluginContributions = AppClientContributions;

export interface ResolvedAppClientContributions {
  readonly routes: readonly AppClientRegisteredRoute[];
  /** Every page, flattened, in declaration order — what the router mounts. */
  readonly settings: readonly AppClientRegisteredSetting[];
  /** The same pages as a tree, in declaration order — what the navigation renders. */
  readonly settingGroups: readonly AppClientRegisteredSettingGroup[];
  readonly providers: readonly AppClientRegisteredProvider[];
}

export interface AppClientPluginDefinition<TOptions> {
  readonly packageName: string;
  readonly bootstrap?: AppClientBootstrapLoader;
  readonly routes?: AppClientRoutesLoader;
  readonly providers?: AppClientProvidersLoader;
  readonly locales?: AppClientLocalesLoader;
  /** Maps options to route component overrides. Return an empty array for none. */
  readonly routeComponentOverrides?: (
    options: TOptions,
  ) => readonly AppClientRouteComponentOverrideDefinition[];
}

export interface AppClientPluginRegistration {
  readonly packageName: string;
  readonly bootstrap?: AppClientBootstrapLoader;
  readonly routes?: AppClientRoutesLoader;
  readonly providers?: AppClientProvidersLoader;
  readonly locales?: AppClientLocalesLoader;
  readonly routeComponentOverrides: readonly AppClientRouteComponentOverrideDefinition[];
  readonly options: unknown;
}

export type AppClientPluginFactory<TOptions = void> = (
  options?: TOptions,
) => AppClientPluginRegistration;

export interface AppClientPlugins {
  readonly plugins: readonly AppClientPluginLoader[];
  readonly routeComponentOverrides: readonly AppClientRouteComponentOverrideDefinition[];
}

/**
 * Wraps a plugin's client entries into a registration factory the application
 * calls in its `client/plugins.ts`.
 *
 * The entries stay lazy: this file is imported statically by the application,
 * so anything it imports at value level enters the entry chunk.
 */
export function defineClientPlugin<TOptions = void>(
  definition: AppClientPluginDefinition<TOptions>,
): AppClientPluginFactory<TOptions> {
  const packageName = normalizePackageName(definition.packageName);

  return (options?: TOptions): AppClientPluginRegistration => {
    const resolvedOptions = (options ?? {}) as TOptions;
    const overrides = definition.routeComponentOverrides
      ? definition.routeComponentOverrides(resolvedOptions)
      : [];

    return Object.freeze({
      packageName,
      bootstrap: definition.bootstrap,
      routes: definition.routes,
      providers: definition.providers,
      locales: definition.locales,
      routeComponentOverrides: defineClientRouteComponentOverrides(overrides),
      options: resolvedOptions,
    });
  };
}

/**
 * Collects the application's registered plugins in order. The array order is
 * the bootstrap order.
 */
export function defineClientPlugins(
  registrations: readonly AppClientPluginRegistration[],
): AppClientPlugins {
  const seen = new Set<string>();
  const plugins: AppClientPluginLoader[] = [];
  const routeComponentOverrides: AppClientRouteComponentOverrideDefinition[] =
    [];

  for (const plugin of registrations) {
    if (seen.has(plugin.packageName)) {
      throw new Error(
        `Client plugin "${plugin.packageName}" is registered more than once.`,
      );
    }
    seen.add(plugin.packageName);

    plugins.push(
      Object.freeze({
        packageName: plugin.packageName,
        bootstrap: plugin.bootstrap,
        routes: plugin.routes,
        providers: plugin.providers,
        locales: plugin.locales,
        options: plugin.options,
        source: 'plugin',
      }),
    );
    routeComponentOverrides.push(...plugin.routeComponentOverrides);
  }

  return Object.freeze({
    plugins: Object.freeze(plugins),
    routeComponentOverrides: Object.freeze(routeComponentOverrides),
  });
}

export function defineAppRoutes(
  routes: readonly AppClientRouteDefinition[],
): AppClientAppRoutesContribution {
  return Object.freeze({
    parent: 'app',
    routes: Object.freeze(routes.map((route) => Object.freeze({ ...route }))),
  });
}

export function defineSettingsRoutes(
  routes: readonly AppClientSettingsRouteDefinition[],
): AppClientSettingsRoutesContribution {
  return Object.freeze({
    parent: 'settings',
    routes: Object.freeze(
      routes.map((route) =>
        Object.freeze(
          isAppClientSettingsRouteGroup(route)
            ? {
                ...route,
                navigation: Object.freeze({ ...route.navigation }),
                children: Object.freeze(
                  route.children.map((child) =>
                    Object.freeze({
                      ...child,
                      ...(child.navigation === undefined
                        ? {}
                        : {
                            navigation: Object.freeze({
                              ...child.navigation,
                            }),
                          }),
                    }),
                  ),
                ),
              }
            : {
                ...route,
                ...(route.navigation === undefined
                  ? {}
                  : { navigation: Object.freeze({ ...route.navigation }) }),
              },
        ),
      ),
    ),
  });
}

export function defineClientRouteComponentOverrides(
  overrides: readonly AppClientRouteComponentOverrideDefinition[],
): readonly AppClientRouteComponentOverrideDefinition[] {
  return Object.freeze(
    overrides.map((override) =>
      Object.freeze({
        ...override,
        routeId: normalizeRouteOverrideId(override.routeId),
        componentEntry: normalizeOptionalComponentEntry(
          override.componentEntry,
          override.routeId,
        ),
      }),
    ),
  );
}

export function defineClientSourceExtension(
  extension: AppClientSourceExtension,
): AppClientSourceExtension {
  const name = extension.name.trim();
  if (!name) {
    throw new Error('A client source extension must define a non-empty name.');
  }
  return Object.freeze({
    ...extension,
    name,
    routeComponentOverrides: extension.routeComponentOverrides
      ? defineClientRouteComponentOverrides(extension.routeComponentOverrides)
      : undefined,
  });
}

function normalizeRouteOverrideId(routeId: string): string {
  const normalized = routeId.trim();
  if (!normalized) {
    throw new Error(
      'A client route component override must define a non-empty routeId.',
    );
  }
  return normalized;
}

export function defineClientProviders(
  providers: readonly AppClientProviderDefinition[],
): readonly AppClientProviderDefinition[] {
  return Object.freeze(
    providers.map((provider) =>
      Object.freeze({
        ...provider,
        before: freezeOptionalList(provider.before),
        after: freezeOptionalList(provider.after),
      }),
    ),
  );
}

export function resolveAppClientContributions(
  contributions: readonly AppClientContributions[],
): ResolvedAppClientContributions {
  const routes: AppClientRegisteredRoute[] = [];
  const routeIds = new Set<string>();
  // Routes and settings share one path space: a setting is mounted at `/settings/<id>`, which a route is free to
  // declare too. Both register here so the collision is reported whichever one the resolver reaches first.
  const claimedPaths = new Map<string, ClaimedPath>();
  const settings: AppClientRegisteredSetting[] = [];
  const settingGroups: AppClientRegisteredSettingGroup[] = [];
  const settingPaths = new Map<string, AppClientRegisteredSetting>();
  const settingGroupIds = new Map<string, AppClientRegisteredSettingGroup>();
  const providers: AppClientRegisteredProvider[] = [];
  const providerIds = new Set<string>();

  for (const contribution of contributions) {
    const packageName = normalizePackageName(contribution.packageName);
    const source = normalizeContributionSource(contribution.source);

    const routeContributions = normalizeRouteContributions(contribution.routes);
    for (const routeContribution of routeContributions) {
      if (routeContribution.parent === 'app') {
        for (const route of routeContribution.routes) {
          const registeredRoute = createRegisteredRoute(
            packageName,
            source,
            route,
          );
          if (routeIds.has(registeredRoute.id)) {
            throw new Error(
              `Plugin "${packageName}" defined duplicate client route name "${registeredRoute.name}".`,
            );
          }

          const pathSignature = createRoutePathSignature(registeredRoute.path);
          const claimed = claimedPaths.get(pathSignature);
          if (claimed) {
            throw new Error(
              `Client route path "${registeredRoute.path}" from plugin "${packageName}" conflicts with ${claimed.kind} "${claimed.id}" at "${claimed.path}".`,
            );
          }

          routeIds.add(registeredRoute.id);
          claimedPaths.set(pathSignature, {
            kind: 'route',
            id: registeredRoute.id,
            path: registeredRoute.path,
          });
          routes.push(registeredRoute);
        }
        continue;
      }

      for (const setting of routeContribution.routes) {
        if (isAppClientSettingsRouteGroup(setting)) {
          const group = createRegisteredSettingGroup(
            packageName,
            source,
            setting,
          );
          const duplicateGroup = settingGroupIds.get(group.id);
          if (duplicateGroup) {
            throw new Error(
              `Client setting group "${group.id}" from plugin "${packageName}" is already registered by "${duplicateGroup.packageName}".`,
            );
          }
          settingGroupIds.set(group.id, group);
          settingGroups.push(group);

          for (const child of group.settings) {
            claimSettingPath(child, packageName, settingPaths, claimedPaths);
            settings.push(child);
          }
          continue;
        }

        const registeredSetting = createRegisteredSetting(
          packageName,
          source,
          setting,
        );
        claimSettingPath(
          registeredSetting,
          packageName,
          settingPaths,
          claimedPaths,
        );
        settings.push(registeredSetting);
      }
    }

    for (const provider of contribution.providers ?? []) {
      const registeredProvider = createRegisteredProvider(
        packageName,
        source,
        provider,
      );
      if (providerIds.has(registeredProvider.id)) {
        throw new Error(
          `Plugin "${packageName}" defined duplicate client provider name "${registeredProvider.name}".`,
        );
      }

      providerIds.add(registeredProvider.id);
      providers.push(registeredProvider);
    }
  }

  return Object.freeze({
    routes: Object.freeze(routes),
    settings: Object.freeze(settings),
    settingGroups: Object.freeze(settingGroups),
    providers: sortProviders(providers),
  });
}

function normalizeRouteContributions(
  contributions:
    | AppClientRouteContribution
    | readonly AppClientRouteContribution[]
    | undefined,
): readonly AppClientRouteContribution[] {
  if (contributions === undefined) {
    return [];
  }
  return 'parent' in contributions ? [contributions] : contributions;
}

export function applyClientRouteComponentOverrides(
  routes: readonly AppClientRegisteredRoute[],
  overrides: readonly AppClientRouteComponentOverrideDefinition[],
): readonly AppClientRegisteredRoute[] {
  const routesById = new Map(routes.map((route) => [route.id, route]));
  const loadersByRouteId = new Map<string, AppClientRouteComponentLoader>();

  for (const override of overrides) {
    const routeId = override.routeId.trim();
    if (!routeId) {
      throw new Error(
        'A client route component override must define a non-empty routeId.',
      );
    }
    if (loadersByRouteId.has(routeId)) {
      throw new Error(
        `Client route component "${routeId}" is overridden more than once.`,
      );
    }
    if (!routesById.has(routeId)) {
      throw new Error(
        `Client route component override references missing route "${routeId}".`,
      );
    }
    if (typeof override.componentLoader !== 'function') {
      throw new Error(
        `Client route component override for "${routeId}" must define a componentLoader function.`,
      );
    }
    loadersByRouteId.set(routeId, override.componentLoader);
  }

  return Object.freeze(
    routes.map((route) => {
      const componentLoader = loadersByRouteId.get(route.id);
      return componentLoader
        ? Object.freeze({
            ...route,
            componentLoader: wrapRouteComponentLoader(
              componentLoader,
              route.id,
            ),
          })
        : route;
    }),
  );
}

function freezeOptionalList(
  values: readonly string[] | undefined,
): readonly string[] | undefined {
  return values ? Object.freeze([...values]) : undefined;
}

function normalizeOptionalComponentEntry(
  componentEntry: string | undefined,
  routeId: string,
): string | undefined {
  if (componentEntry === undefined) {
    return undefined;
  }
  const normalized = componentEntry.trim();
  if (!normalized) {
    throw new Error(
      `Client route component override for "${routeId}" must define a non-empty componentEntry when provided.`,
    );
  }
  return normalized;
}

function normalizePackageName(packageName: string): string {
  const normalized = packageName.trim();
  if (!normalized) {
    throw new Error('A client contribution must define a package name.');
  }
  return normalized;
}

function normalizeContributionSource(
  source: AppClientContributionSource | undefined,
): AppClientContributionSource {
  return source ?? 'plugin';
}

interface ClaimedPath {
  readonly kind: 'route' | 'setting';
  readonly id: string;
  readonly path: string;
}

/** Builds the path a setting is served at: `/settings/<id>`, or `/settings/<group>/<id>` inside a group. */
function normalizeSettingsRoutePath(
  path: string,
  groupPath: string | undefined,
  packageName: string,
  name: string,
): string {
  const normalized = normalizeRoutePath(path, packageName, name);
  const parent =
    groupPath === undefined
      ? ''
      : normalizeRoutePath(groupPath, packageName, name).replace(/\/$/u, '');
  return `${SETTINGS_PATH_PREFIX}${parent}${normalized}`;
}

/**
 * Records a page's path in both the settings map and the shared route/setting path map, so a duplicate is reported
 * whichever kind claimed the address first.
 */
function claimSettingPath(
  setting: AppClientRegisteredSetting,
  packageName: string,
  settingPaths: Map<string, AppClientRegisteredSetting>,
  claimedPaths: Map<string, ClaimedPath>,
): void {
  const duplicate = settingPaths.get(setting.path);
  if (duplicate) {
    throw new Error(
      `Client setting "${setting.path}" from plugin "${packageName}" is already registered by "${duplicate.packageName}".`,
    );
  }

  const pathSignature = createRoutePathSignature(setting.path);
  const claimed = claimedPaths.get(pathSignature);
  if (claimed) {
    throw new Error(
      `Client setting "${setting.id}" from plugin "${packageName}" conflicts with ${claimed.kind} "${claimed.id}" at "${claimed.path}".`,
    );
  }

  settingPaths.set(setting.path, setting);
  claimedPaths.set(pathSignature, {
    kind: 'setting',
    id: setting.id,
    path: setting.path,
  });
}

function normalizeSettingId(
  id: string,
  packageName: string,
  kind: 'setting' | 'setting group',
): string {
  const normalized = id.trim();
  if (!normalized) {
    throw new Error(
      `Client ${kind} from plugin "${packageName}" must define a non-empty id.`,
    );
  }
  if (!SETTING_ID_PATTERN.test(normalized)) {
    throw new Error(
      `Client ${kind} id "${id}" from plugin "${packageName}" must be a single segment of letters, digits, dot, underscore, or dash.`,
    );
  }
  return normalized;
}

function normalizeSettingTitle(
  title: string,
  id: string,
  packageName: string,
  kind: 'setting' | 'setting group',
): string {
  const normalized = title.trim();
  if (!normalized) {
    throw new Error(
      `Client ${kind} "${id}" from plugin "${packageName}" must define a non-empty title.`,
    );
  }
  return normalized;
}

function createRegisteredSettingGroup(
  packageName: string,
  source: AppClientContributionSource,
  group: AppClientSettingsRouteGroupDefinition,
): AppClientRegisteredSettingGroup {
  const id = normalizeSettingId(group.name, packageName, 'setting group');
  const title = normalizeSettingTitle(
    group.navigation.title,
    id,
    packageName,
    'setting group',
  );
  if (group.children.length === 0) {
    throw new Error(
      `Client setting group "${id}" from plugin "${packageName}" must define at least one child.`,
    );
  }

  const childIds = new Set<string>();
  const children = group.children.map((child) => {
    const registered = createRegisteredSetting(
      packageName,
      source,
      child,
      id,
      group.path,
    );
    if (childIds.has(registered.id)) {
      throw new Error(
        `Client setting group "${id}" from plugin "${packageName}" defines duplicate child id "${registered.id}".`,
      );
    }
    childIds.add(registered.id);
    return registered;
  });

  return Object.freeze({
    ...(group.navigation.icon === undefined
      ? {}
      : { icon: group.navigation.icon }),
    id,
    packageName,
    settings: Object.freeze(children),
    source,
    title,
  });
}

function createRegisteredSetting(
  packageName: string,
  source: AppClientContributionSource,
  setting: AppClientSettingsRoutePageDefinition,
  groupId?: string,
  groupPath?: string,
): AppClientRegisteredSetting {
  const id = normalizeSettingId(setting.name, packageName, 'setting');
  const title = normalizeSettingTitle(
    setting.navigation?.title ?? setting.name,
    id,
    packageName,
    'setting',
  );
  if (typeof setting.componentLoader !== 'function') {
    throw new Error(
      `Client setting "${id}" from plugin "${packageName}" must define a componentLoader function.`,
    );
  }

  return Object.freeze({
    ...(setting.access === undefined ? {} : { access: setting.access }),
    ...(setting.navigation?.icon === undefined
      ? {}
      : { icon: setting.navigation.icon }),
    ...(groupId === undefined ? {} : { groupId }),
    id,
    packageName,
    navigation: setting.navigation !== undefined,
    pageLoader: wrapRouteComponentLoader(
      setting.componentLoader,
      id,
      'setting',
    ),
    path: normalizeSettingsRoutePath(setting.path, groupPath, packageName, id),
    source,
    title,
  });
}

function createRegisteredRoute(
  packageName: string,
  source: AppClientContributionSource,
  route: AppClientRouteDefinition,
): AppClientRegisteredRoute {
  const name = normalizeContributionName(route.name, packageName, 'route');
  const path = normalizeRoutePath(route.path, packageName, name);
  const auth = normalizeRouteAuth(route.auth, packageName, name);
  if (path === '/' && source !== 'application') {
    throw new Error(
      `Client route "${name}" from plugin "${packageName}" cannot use reserved application root path "/".`,
    );
  }
  if (
    RESERVED_APPLICATION_ROUTE_PATHS.has(path.toLowerCase()) &&
    auth !== 'guest'
  ) {
    throw new Error(
      `Client route "${name}" from plugin "${packageName}" cannot use reserved path "${path}" unless auth is "guest".`,
    );
  }
  if (typeof route.componentLoader !== 'function') {
    throw new Error(
      `Client route "${name}" from plugin "${packageName}" must define a componentLoader function.`,
    );
  }

  const id = `${packageName}:${name}`;
  return Object.freeze({
    auth,
    ...(route.access === undefined ? {} : { access: route.access }),
    componentLoader: wrapRouteComponentLoader(route.componentLoader, id),
    id,
    name,
    packageName,
    path,
    source,
  });
}

function normalizeRouteAuth(
  auth: AppClientRouteAuth | undefined,
  packageName: string,
  routeName: string,
): AppClientRouteAuth {
  const normalized = auth ?? 'required';
  if (
    normalized !== 'required' &&
    normalized !== 'guest' &&
    normalized !== 'optional'
  ) {
    throw new Error(
      `Client route "${routeName}" from plugin "${packageName}" must use auth "required", "guest", or "optional".`,
    );
  }
  return normalized;
}

function createRegisteredProvider(
  packageName: string,
  source: AppClientContributionSource,
  provider: AppClientProviderDefinition,
): AppClientRegisteredProvider {
  const name = normalizeContributionName(
    provider.name,
    packageName,
    'provider',
  );
  if (!provider.component) {
    throw new Error(
      `Client provider "${name}" from plugin "${packageName}" must define a component.`,
    );
  }
  const layer = normalizeProviderLayer(
    provider.layer,
    source,
    packageName,
    name,
  );

  return Object.freeze({
    id: `${packageName}:${name}`,
    name,
    packageName,
    source,
    layer,
    component: provider.component,
    before: normalizeProviderTargets(provider.before, packageName, name),
    after: normalizeProviderTargets(provider.after, packageName, name),
  });
}

function normalizeProviderLayer(
  layer: AppClientProviderLayer | undefined,
  source: AppClientContributionSource,
  packageName: string,
  providerName: string,
): AppClientProviderLayer {
  const normalized =
    layer ?? (source === 'application' ? 'application' : 'extension');
  if (
    normalized !== 'root' &&
    normalized !== 'application' &&
    normalized !== 'extension'
  ) {
    throw new Error(
      `Client provider "${providerName}" from "${packageName}" uses unsupported layer "${String(layer)}".`,
    );
  }
  if (source === 'plugin' && normalized !== 'extension') {
    throw new Error(
      `Client provider "${providerName}" from plugin "${packageName}" cannot use layer "${normalized}"; plugin providers must use layer "extension".`,
    );
  }
  if (source === 'application' && normalized === 'extension') {
    throw new Error(
      `Client provider "${providerName}" from application "${packageName}" cannot use layer "extension"; application providers must use layer "root" or "application".`,
    );
  }
  return normalized;
}

function normalizeContributionName(
  name: string,
  packageName: string,
  type: 'provider' | 'route',
): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error(
      `Client ${type} from plugin "${packageName}" must define a non-empty name.`,
    );
  }
  if (!CONTRIBUTION_NAME_PATTERN.test(normalized)) {
    throw new Error(
      `Client ${type} name "${name}" from plugin "${packageName}" contains unsupported characters.`,
    );
  }
  return normalized;
}

function normalizeProviderTargets(
  targets: readonly string[] | undefined,
  packageName: string,
  providerName: string,
): readonly string[] | undefined {
  if (!targets) {
    return undefined;
  }

  const normalized = targets.map((target) => target.trim());
  if (normalized.some((target) => !target || !target.includes(':'))) {
    throw new Error(
      `Client provider "${providerName}" from plugin "${packageName}" must reference providers by their full plugin-qualified ID.`,
    );
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(
      `Client provider "${providerName}" from plugin "${packageName}" contains duplicate ordering references.`,
    );
  }
  return Object.freeze(normalized);
}

function normalizeRoutePath(
  routePath: string,
  packageName: string,
  routeName: string,
): string {
  const trimmed = routePath.trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('?') ||
    trimmed.includes('#') ||
    trimmed.includes('*') ||
    trimmed.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error(
      `Client route "${routeName}" from plugin "${packageName}" must use an absolute application path without query, hash, wildcard, or traversal segments.`,
    );
  }

  const normalized =
    trimmed === '/'
      ? '/'
      : trimmed.replace(/\/+$/g, '').replace(/\/{2,}/g, '/');
  return normalized;
}

function createRoutePathSignature(routePath: string): string {
  return routePath
    .split('/')
    .map((segment) => (segment.startsWith(':') ? ':' : segment.toLowerCase()))
    .join('/');
}

function wrapRouteComponentLoader(
  componentLoader: AppClientRouteComponentLoader,
  id: string,
  kind: 'route' | 'setting' = 'route',
): AppClientRouteComponentLoader {
  return async () => {
    try {
      const module = await componentLoader();
      if (typeof module.default !== 'function') {
        throw new Error(
          `The ${kind} component module must default-export a React component.`,
        );
      }
      return module;
    } catch (error) {
      throw new Error(`Failed to load client ${kind} "${id}".`, {
        cause: error,
      });
    }
  };
}

function sortProviders(
  providers: readonly AppClientRegisteredProvider[],
): readonly AppClientRegisteredProvider[] {
  const providersById = new Map(
    providers.map((provider) => [provider.id, provider]),
  );
  for (const provider of providers) {
    for (const targetId of [
      ...(provider.before ?? []),
      ...(provider.after ?? []),
    ]) {
      assertProviderTarget(providersById, provider.id, targetId);
      const target = providersById.get(targetId);
      if (target && target.layer !== provider.layer) {
        throw new Error(
          `Client provider "${provider.id}" in layer "${provider.layer}" cannot declare ordering against provider "${target.id}" in layer "${target.layer}"; before/after constraints may only reference providers in the same layer.`,
        );
      }
    }
  }

  const layerOrder: readonly AppClientProviderLayer[] = [
    'root',
    'application',
    'extension',
  ];
  const sorted = layerOrder.flatMap((layer) =>
    sortProviderLayer(providers.filter((provider) => provider.layer === layer)),
  );
  return Object.freeze(sorted);
}

function sortProviderLayer(
  providers: readonly AppClientRegisteredProvider[],
): readonly AppClientRegisteredProvider[] {
  const providersById = new Map(
    providers.map((provider) => [provider.id, provider]),
  );
  const registrationIndex = new Map(
    providers.map((provider, index) => [provider.id, index]),
  );
  const outgoing = new Map(
    providers.map((provider) => [provider.id, new Set<string>()]),
  );
  const indegree = new Map(providers.map((provider) => [provider.id, 0]));

  const addEdge = (from: string, to: string): void => {
    const targets = outgoing.get(from);
    if (!targets || targets.has(to)) {
      return;
    }
    targets.add(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  };

  for (const provider of providers) {
    for (const target of provider.before ?? []) {
      assertProviderTarget(providersById, provider.id, target);
      addEdge(provider.id, target);
    }
    for (const target of provider.after ?? []) {
      assertProviderTarget(providersById, provider.id, target);
      addEdge(target, provider.id);
    }
  }

  const ready = providers
    .filter((provider) => indegree.get(provider.id) === 0)
    .map((provider) => provider.id);
  const sorted: AppClientRegisteredProvider[] = [];

  while (ready.length > 0) {
    ready.sort(
      (left, right) =>
        (registrationIndex.get(left) ?? 0) -
        (registrationIndex.get(right) ?? 0),
    );
    const id = ready.shift();
    if (!id) {
      break;
    }
    const provider = providersById.get(id);
    if (!provider) {
      continue;
    }
    sorted.push(provider);

    for (const target of outgoing.get(id) ?? []) {
      const nextIndegree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, nextIndegree);
      if (nextIndegree === 0) {
        ready.push(target);
      }
    }
  }

  if (sorted.length !== providers.length) {
    const cycle = findProviderCycle(providers, outgoing);
    throw new Error(
      `Circular client provider order detected: ${cycle.join(' -> ')}.`,
    );
  }

  return Object.freeze(sorted);
}

function assertProviderTarget(
  providersById: ReadonlyMap<string, AppClientRegisteredProvider>,
  providerId: string,
  targetId: string,
): void {
  if (!providersById.has(targetId)) {
    throw new Error(
      `Client provider "${providerId}" references missing provider "${targetId}".`,
    );
  }
}

function findProviderCycle(
  providers: readonly AppClientRegisteredProvider[],
  outgoing: ReadonlyMap<string, ReadonlySet<string>>,
): readonly string[] {
  const visited = new Set<string>();
  const active = new Set<string>();
  const path: string[] = [];

  const visit = (id: string): readonly string[] | undefined => {
    if (active.has(id)) {
      const cycleStart = path.indexOf(id);
      return [...path.slice(cycleStart), id];
    }
    if (visited.has(id)) {
      return undefined;
    }

    visited.add(id);
    active.add(id);
    path.push(id);
    for (const target of outgoing.get(id) ?? []) {
      const cycle = visit(target);
      if (cycle) {
        return cycle;
      }
    }
    path.pop();
    active.delete(id);
    return undefined;
  };

  for (const provider of providers) {
    const cycle = visit(provider.id);
    if (cycle) {
      return cycle;
    }
  }

  return providers.map((provider) => provider.id);
}
