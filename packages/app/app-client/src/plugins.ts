import type { LocalesModule } from '@nocobase/i18n';
import type { ServiceProviderLifecycle } from '@nocobase/service-provider';
import type { ComponentType } from 'react';

import type { ClientApplication } from './application.js';
import type {
  AppClientConfigContribution,
  AppClientReactProvider,
  AppClientRefineConfig,
} from './config.js';

const CONTRIBUTION_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
// A setting id is one URL segment. Nesting comes from the tree, not from slashes inside an id.
const SETTING_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const SETTINGS_PATH_PREFIX = '/settings';
const DEV_PATH_PREFIX = '/dev';
const RESERVED_APPLICATION_ROUTE_PATHS = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
]);

export type AppClientRouteAuth = 'required' | 'guest' | 'optional';

export type AppClientContributionSource = 'application' | 'plugin';

export type AppClientReactProviderLayer = 'root' | 'application' | 'extension';

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

/**
 * The two navigable surfaces built out of the same page tree. They differ in where they mount and in whether they
 * survive a production build, not in how a plugin declares them.
 */
export type AppClientNavigationSurface = 'settings' | 'dev';

/**
 * A dev page is declared exactly like a settings page. Only the mount prefix and the fact that the whole surface
 * disappears from a production build differ, so plugin authors have one shape to learn rather than two.
 */
export type AppClientDevRoutePageDefinition =
  AppClientSettingsRoutePageDefinition;

export type AppClientDevRouteGroupDefinition =
  AppClientSettingsRouteGroupDefinition;

/** A child Route contributed to the built-in Dev Route. */
export type AppClientDevRouteDefinition = AppClientSettingsRouteDefinition;

export function isAppClientDevRouteGroup(
  route: AppClientDevRouteDefinition,
): route is AppClientDevRouteGroupDefinition {
  return isAppClientSettingsRouteGroup(route);
}

/**
 * A resolved page, flattened out of the Route tree with its full path and optional navigation group. Both surfaces
 * resolve to this shape, so one navigation layout renders either of them.
 */
export interface AppClientRegisteredSetting {
  /** The application path produced from the surface prefix and the contributed relative path. */
  readonly path: string;
  readonly id: string;
  readonly title: string;
  readonly navigation: boolean;
  readonly surface: AppClientNavigationSurface;
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
  readonly surface: AppClientNavigationSurface;
  readonly icon?: AppClientSettingIcon;
  readonly packageName: string;
  readonly source: AppClientContributionSource;
  readonly settings: readonly AppClientRegisteredSetting[];
}

/** A resolved dev page. Identical in shape to a settings page; the surface field tells them apart. */
export type AppClientRegisteredDevRoute = AppClientRegisteredSetting;

export type AppClientRegisteredDevRouteGroup = AppClientRegisteredSettingGroup;

export interface AppClientAppRoutesContribution {
  readonly parent: 'app';
  readonly routes: readonly AppClientRouteDefinition[];
}

export interface AppClientSettingsRoutesContribution {
  readonly parent: 'settings';
  readonly routes: readonly AppClientSettingsRouteDefinition[];
}

export interface AppClientDevRoutesContribution {
  readonly parent: 'dev';
  readonly routes: readonly AppClientDevRouteDefinition[];
}

export type AppClientRouteContribution =
  | AppClientAppRoutesContribution
  | AppClientSettingsRoutesContribution
  | AppClientDevRoutesContribution;

export interface AppClientRouteComponentOverrideDefinition {
  readonly routeId: string;
  readonly componentLoader: AppClientRouteComponentLoader;
  readonly componentEntry?: string;
}

export interface AppClientSourceExtension {
  readonly name: string;
  readonly routeComponentOverrides?: readonly AppClientRouteComponentOverrideDefinition[];
}

export interface AppClientReactProviderDefinition {
  readonly name: string;
  readonly component: AppClientReactProvider;
  readonly layer?: AppClientReactProviderLayer;
  readonly before?: readonly string[];
  readonly after?: readonly string[];
}

export interface AppClientRegisteredReactProvider extends AppClientReactProviderDefinition {
  readonly id: string;
  readonly layer: AppClientReactProviderLayer;
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

export interface ClientServiceProviderContext<TOptions = unknown> {
  readonly packageName: string;
  readonly source: AppClientContributionSource;
  readonly options: TOptions;
}

export type ClientServiceProviderConstructor<TOptions = unknown> = new (
  app: ClientApplication,
  context: ClientServiceProviderContext<TOptions>,
) => ServiceProviderLifecycle;

export interface AppClientRegisteredServiceProvider {
  readonly Provider: ClientServiceProviderConstructor;
  readonly context: ClientServiceProviderContext;
}

export type AppClientRoutes<TOptions = void> =
  | AppClientRouteContribution
  | readonly AppClientRouteContribution[]
  | ((
      options: TOptions,
    ) => AppClientRouteContribution | readonly AppClientRouteContribution[]);

export type AppClientReactProviders<TOptions = void> =
  | readonly AppClientReactProviderDefinition[]
  | ((options: TOptions) => readonly AppClientReactProviderDefinition[]);

export type AppClientServiceProviders<TOptions = void> =
  | readonly ClientServiceProviderConstructor<TOptions>[]
  | ((
      options: TOptions,
    ) => readonly ClientServiceProviderConstructor<TOptions>[]);

export type AppClientLocales = LocalesModule;

export interface AppClientContribution<TOptions = void> {
  readonly packageName: string;
  readonly serviceProviders?: AppClientServiceProviders<TOptions>;
  readonly reactProviders?: AppClientReactProviders<TOptions>;
  readonly routes?: AppClientRoutes<TOptions>;
  readonly locales?: AppClientLocales;
  readonly options?: TOptions;
}

export interface AppClientContributions {
  readonly packageName: string;
  readonly source?: AppClientContributionSource;
  readonly routes?:
    AppClientRouteContribution | readonly AppClientRouteContribution[];
  readonly reactProviders?: readonly AppClientReactProviderDefinition[];
}

export type AppClientPluginContributions = AppClientContributions;

export interface ResolvedAppClientContributions {
  readonly routes: readonly AppClientRegisteredRoute[];
  /** Every page, flattened, in declaration order — what the router mounts. */
  readonly settings: readonly AppClientRegisteredSetting[];
  /** The same pages as a tree, in declaration order — what the navigation renders. */
  readonly settingGroups: readonly AppClientRegisteredSettingGroup[];
  /** Dev pages, flattened. Always empty in a production build, where the contributions carry no routes. */
  readonly devRoutes: readonly AppClientRegisteredDevRoute[];
  readonly devRouteGroups: readonly AppClientRegisteredDevRouteGroup[];
  readonly reactProviders: readonly AppClientRegisteredReactProvider[];
}

export interface AppClientPluginDefinition<
  TOptions,
> extends AppClientContribution<TOptions> {
  readonly config?:
    AppClientConfigContribution | readonly AppClientConfigContribution[];
  /** Maps options to route component overrides. Return an empty array for none. */
  readonly routeComponentOverrides?: (
    options: TOptions,
  ) => readonly AppClientRouteComponentOverrideDefinition[];
}

export interface AppClientPluginRegistration {
  readonly packageName: string;
  readonly config: readonly AppClientConfigContribution[];
  readonly serviceProviders: readonly ClientServiceProviderConstructor[];
  readonly routes: readonly AppClientRouteContribution[];
  readonly reactProviders: readonly AppClientReactProviderDefinition[];
  readonly locales?: AppClientLocales;
  readonly routeComponentOverrides: readonly AppClientRouteComponentOverrideDefinition[];
  readonly options: unknown;
}

export type AppClientPluginFactory<TOptions = void> = (
  options?: TOptions,
) => AppClientPluginRegistration;

export interface AppClientPlugins {
  readonly plugins: readonly AppClientPluginRegistration[];
  readonly routeComponentOverrides: readonly AppClientRouteComponentOverrideDefinition[];
}

/**
 * Wraps a plugin's client entries into a registration factory the application
 * calls in its `client/plugins.ts`.
 *
 * Contribution declarations are static. Route components and locale messages
 * remain lazy at their leaf loaders.
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
      config: freezeConfigContributions(definition.config),
      serviceProviders: Object.freeze(
        resolveServiceProviders(definition.serviceProviders, resolvedOptions),
      ),
      routes: Object.freeze(
        normalizeRouteContributions(
          resolveContribution(definition.routes, resolvedOptions),
        ),
      ),
      reactProviders: defineClientReactProviders(
        resolveContribution(definition.reactProviders, resolvedOptions) ?? [],
      ),
      locales: definition.locales,
      routeComponentOverrides: defineClientRouteComponentOverrides(overrides),
      options: resolvedOptions,
    });
  };
}

/**
 * Collects the application's registered plugins in declaration order.
 */
export function defineClientPlugins(
  registrations: readonly AppClientPluginRegistration[],
): AppClientPlugins {
  const seen = new Set<string>();
  const plugins: AppClientPluginRegistration[] = [];
  const routeComponentOverrides: AppClientRouteComponentOverrideDefinition[] =
    [];

  for (const plugin of registrations) {
    if (seen.has(plugin.packageName)) {
      throw new Error(
        `Client plugin "${plugin.packageName}" is registered more than once.`,
      );
    }
    seen.add(plugin.packageName);

    plugins.push(plugin);
    routeComponentOverrides.push(...plugin.routeComponentOverrides);
  }

  return Object.freeze({
    plugins: Object.freeze(plugins),
    routeComponentOverrides: Object.freeze(routeComponentOverrides),
  });
}

function freezeConfigContributions(
  config:
    | AppClientConfigContribution
    | readonly AppClientConfigContribution[]
    | undefined,
): readonly AppClientConfigContribution[] {
  if (config === undefined) {
    return Object.freeze([]);
  }
  return Object.freeze([
    ...(isConfigContributionArray(config) ? config : [config]),
  ]);
}

function isConfigContributionArray(
  value: AppClientConfigContribution | readonly AppClientConfigContribution[],
): value is readonly AppClientConfigContribution[] {
  return Array.isArray(value);
}

function resolveContribution<TOptions, TResult>(
  contribution: TResult | ((options: TOptions) => TResult) | undefined,
  options: TOptions,
): TResult | undefined {
  return typeof contribution === 'function'
    ? (contribution as (value: TOptions) => TResult)(options)
    : contribution;
}

function resolveServiceProviders<TOptions>(
  contribution: AppClientServiceProviders<TOptions> | undefined,
  options: TOptions,
): readonly ClientServiceProviderConstructor[] {
  const providers = resolveContribution(contribution, options) ?? [];
  return providers as readonly ClientServiceProviderConstructor[];
}

export function defineAppRoutes(
  routes: readonly AppClientRouteDefinition[],
): AppClientAppRoutesContribution {
  return Object.freeze({
    parent: 'app',
    routes: Object.freeze(routes.map((route) => Object.freeze({ ...route }))),
  });
}

function freezeNavigationRoutes(
  routes: readonly AppClientSettingsRouteDefinition[],
): readonly AppClientSettingsRouteDefinition[] {
  return Object.freeze(
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
  );
}

export function defineSettingsRoutes(
  routes: readonly AppClientSettingsRouteDefinition[],
): AppClientSettingsRoutesContribution {
  return Object.freeze({
    parent: 'settings',
    routes: freezeNavigationRoutes(routes),
  });
}

/**
 * What a bundler injects onto `import.meta`. Declared locally rather than globally: `vite/client` types `env` as
 * required, so a global augmentation here would conflict wherever both are loaded.
 */
interface ImportMetaWithBundlerEnv {
  readonly env?: { readonly PROD?: boolean; readonly DEV?: boolean };
}

/**
 * Declares pages under the built-in Dev Route, for tooling a developer uses while building the application rather
 * than anything a deployed application should expose.
 *
 * The guard lives here rather than at each call site so a plugin author writes `defineDevRoutes([...])` exactly the
 * way they write `defineSettingsRoutes([...])`, with no way to forget it. A production build replaces
 * `import.meta.env.PROD` with `true` at transform time, which makes the argument unreachable and lets the bundler
 * drop every page component behind it — along with any module only those pages import. Nothing about this surface
 * reaches the production bundle.
 *
 * `env` is read through a local type and an optional access because this module is compiled by consumers that do not
 * load bundler ambient types, and is imported under plain Node by `client:inspect` and by Vitest, where
 * `import.meta.env` is undefined. Both of those are development contexts, so both see the routes.
 */
export function defineDevRoutes(
  routes: readonly AppClientDevRouteDefinition[],
): AppClientDevRoutesContribution {
  if ((import.meta as ImportMetaWithBundlerEnv).env?.PROD) {
    return Object.freeze({ parent: 'dev', routes: Object.freeze([]) });
  }
  return Object.freeze({
    parent: 'dev',
    routes: freezeNavigationRoutes(routes),
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

export function defineClientReactProviders(
  reactProviders: readonly AppClientReactProviderDefinition[],
): readonly AppClientReactProviderDefinition[] {
  return Object.freeze(
    reactProviders.map((reactProvider) =>
      Object.freeze({
        ...reactProvider,
        before: freezeOptionalList(reactProvider.before),
        after: freezeOptionalList(reactProvider.after),
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
  const devRoutes: AppClientRegisteredDevRoute[] = [];
  const devRouteGroups: AppClientRegisteredDevRouteGroup[] = [];
  const devRoutePaths = new Map<string, AppClientRegisteredDevRoute>();
  const devRouteGroupIds = new Map<string, AppClientRegisteredDevRouteGroup>();
  const reactProviders: AppClientRegisteredReactProvider[] = [];
  const reactProviderIds = new Set<string>();

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

      // Both navigable surfaces resolve through the same code, differing only in the prefix they mount under and in
      // which collections they accumulate into.
      const surface: AppClientNavigationSurface = routeContribution.parent;
      const surfacePages = surface === 'dev' ? devRoutes : settings;
      const surfaceGroups = surface === 'dev' ? devRouteGroups : settingGroups;
      const surfacePaths = surface === 'dev' ? devRoutePaths : settingPaths;
      const surfaceGroupIds =
        surface === 'dev' ? devRouteGroupIds : settingGroupIds;

      for (const setting of routeContribution.routes) {
        if (isAppClientSettingsRouteGroup(setting)) {
          const group = createRegisteredSettingGroup(
            packageName,
            source,
            setting,
            surface,
          );
          const duplicateGroup = surfaceGroupIds.get(group.id);
          if (duplicateGroup) {
            throw new Error(
              `Client ${describeSurface(surface)} group "${group.id}" from plugin "${packageName}" is already registered by "${duplicateGroup.packageName}".`,
            );
          }
          surfaceGroupIds.set(group.id, group);
          surfaceGroups.push(group);

          for (const child of group.settings) {
            claimSettingPath(child, packageName, surfacePaths, claimedPaths);
            surfacePages.push(child);
          }
          continue;
        }

        const registeredSetting = createRegisteredSetting(
          packageName,
          source,
          setting,
          surface,
        );
        claimSettingPath(
          registeredSetting,
          packageName,
          surfacePaths,
          claimedPaths,
        );
        surfacePages.push(registeredSetting);
      }
    }

    for (const reactProvider of contribution.reactProviders ?? []) {
      const registeredReactProvider = createRegisteredReactProvider(
        packageName,
        source,
        reactProvider,
      );
      if (reactProviderIds.has(registeredReactProvider.id)) {
        throw new Error(
          `Plugin "${packageName}" defined duplicate client reactProvider name "${registeredReactProvider.name}".`,
        );
      }

      reactProviderIds.add(registeredReactProvider.id);
      reactProviders.push(registeredReactProvider);
    }
  }

  return Object.freeze({
    routes: Object.freeze(routes),
    settings: Object.freeze(settings),
    settingGroups: Object.freeze(settingGroups),
    devRoutes: Object.freeze(devRoutes),
    devRouteGroups: Object.freeze(devRouteGroups),
    reactProviders: sortReactProviders(reactProviders),
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
  readonly kind: 'route' | 'setting' | 'dev route';
  readonly id: string;
  readonly path: string;
}

/** Names a surface for error messages, so a dev route never reports itself as a setting. */
function describeSurface(surface: AppClientNavigationSurface): string {
  return surface === 'dev' ? 'dev route' : 'setting';
}

/**
 * Builds the path a page is served at: `/settings/<id>` or `/dev/<id>`, with the group segment in between when the
 * page sits inside a group.
 */
function normalizeSettingsRoutePath(
  path: string,
  groupPath: string | undefined,
  packageName: string,
  name: string,
  surface: AppClientNavigationSurface,
): string {
  const normalized = normalizeRoutePath(path, packageName, name);
  const parent =
    groupPath === undefined
      ? ''
      : normalizeRoutePath(groupPath, packageName, name).replace(/\/$/u, '');
  const prefix = surface === 'dev' ? DEV_PATH_PREFIX : SETTINGS_PATH_PREFIX;
  return `${prefix}${parent}${normalized}`;
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
  const kind = describeSurface(setting.surface);
  const duplicate = settingPaths.get(setting.path);
  if (duplicate) {
    throw new Error(
      `Client ${kind} "${setting.path}" from plugin "${packageName}" is already registered by "${duplicate.packageName}".`,
    );
  }

  const pathSignature = createRoutePathSignature(setting.path);
  const claimed = claimedPaths.get(pathSignature);
  if (claimed) {
    throw new Error(
      `Client ${kind} "${setting.id}" from plugin "${packageName}" conflicts with ${claimed.kind} "${claimed.id}" at "${claimed.path}".`,
    );
  }

  settingPaths.set(setting.path, setting);
  claimedPaths.set(pathSignature, {
    kind: setting.surface === 'dev' ? 'dev route' : 'setting',
    id: setting.id,
    path: setting.path,
  });
}

function normalizeSettingId(
  id: string,
  packageName: string,
  kind: string,
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
  kind: string,
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
  surface: AppClientNavigationSurface,
): AppClientRegisteredSettingGroup {
  const groupKind = `${describeSurface(surface)} group`;
  const id = normalizeSettingId(group.name, packageName, groupKind);
  const title = normalizeSettingTitle(
    group.navigation.title,
    id,
    packageName,
    groupKind,
  );
  if (group.children.length === 0) {
    throw new Error(
      `Client ${groupKind} "${id}" from plugin "${packageName}" must define at least one child.`,
    );
  }

  const childIds = new Set<string>();
  const children = group.children.map((child) => {
    const registered = createRegisteredSetting(
      packageName,
      source,
      child,
      surface,
      id,
      group.path,
    );
    if (childIds.has(registered.id)) {
      throw new Error(
        `Client ${groupKind} "${id}" from plugin "${packageName}" defines duplicate child id "${registered.id}".`,
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
    surface,
    title,
  });
}

function createRegisteredSetting(
  packageName: string,
  source: AppClientContributionSource,
  setting: AppClientSettingsRoutePageDefinition,
  surface: AppClientNavigationSurface,
  groupId?: string,
  groupPath?: string,
): AppClientRegisteredSetting {
  const kind = describeSurface(surface);
  const id = normalizeSettingId(setting.name, packageName, kind);
  const title = normalizeSettingTitle(
    setting.navigation?.title ?? setting.name,
    id,
    packageName,
    kind,
  );
  if (typeof setting.componentLoader !== 'function') {
    throw new Error(
      `Client ${kind} "${id}" from plugin "${packageName}" must define a componentLoader function.`,
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
    pageLoader: wrapRouteComponentLoader(setting.componentLoader, id, kind),
    path: normalizeSettingsRoutePath(
      setting.path,
      groupPath,
      packageName,
      id,
      surface,
    ),
    source,
    surface,
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

function createRegisteredReactProvider(
  packageName: string,
  source: AppClientContributionSource,
  reactProvider: AppClientReactProviderDefinition,
): AppClientRegisteredReactProvider {
  const name = normalizeContributionName(
    reactProvider.name,
    packageName,
    'reactProvider',
  );
  if (!reactProvider.component) {
    throw new Error(
      `Client reactProvider "${name}" from plugin "${packageName}" must define a component.`,
    );
  }
  const layer = normalizeReactProviderLayer(
    reactProvider.layer,
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
    component: reactProvider.component,
    before: normalizeReactProviderTargets(
      reactProvider.before,
      packageName,
      name,
    ),
    after: normalizeReactProviderTargets(
      reactProvider.after,
      packageName,
      name,
    ),
  });
}

function normalizeReactProviderLayer(
  layer: AppClientReactProviderLayer | undefined,
  source: AppClientContributionSource,
  packageName: string,
  reactProviderName: string,
): AppClientReactProviderLayer {
  const normalized =
    layer ?? (source === 'application' ? 'application' : 'extension');
  if (
    normalized !== 'root' &&
    normalized !== 'application' &&
    normalized !== 'extension'
  ) {
    throw new Error(
      `Client reactProvider "${reactProviderName}" from "${packageName}" uses unsupported layer "${String(layer)}".`,
    );
  }
  if (source === 'plugin' && normalized !== 'extension') {
    throw new Error(
      `Client reactProvider "${reactProviderName}" from plugin "${packageName}" cannot use layer "${normalized}"; plugin reactProviders must use layer "extension".`,
    );
  }
  if (source === 'application' && normalized === 'extension') {
    throw new Error(
      `Client reactProvider "${reactProviderName}" from application "${packageName}" cannot use layer "extension"; application reactProviders must use layer "root" or "application".`,
    );
  }
  return normalized;
}

function normalizeContributionName(
  name: string,
  packageName: string,
  type: 'reactProvider' | 'route',
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

function normalizeReactProviderTargets(
  targets: readonly string[] | undefined,
  packageName: string,
  reactProviderName: string,
): readonly string[] | undefined {
  if (!targets) {
    return undefined;
  }

  const normalized = targets.map((target) => target.trim());
  if (normalized.some((target) => !target || !target.includes(':'))) {
    throw new Error(
      `Client reactProvider "${reactProviderName}" from plugin "${packageName}" must reference reactProviders by their full plugin-qualified ID.`,
    );
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(
      `Client reactProvider "${reactProviderName}" from plugin "${packageName}" contains duplicate ordering references.`,
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
  kind: string = 'route',
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

function sortReactProviders(
  reactProviders: readonly AppClientRegisteredReactProvider[],
): readonly AppClientRegisteredReactProvider[] {
  const reactProvidersById = new Map(
    reactProviders.map((reactProvider) => [reactProvider.id, reactProvider]),
  );
  for (const reactProvider of reactProviders) {
    for (const targetId of [
      ...(reactProvider.before ?? []),
      ...(reactProvider.after ?? []),
    ]) {
      assertReactProviderTarget(reactProvidersById, reactProvider.id, targetId);
      const target = reactProvidersById.get(targetId);
      if (target && target.layer !== reactProvider.layer) {
        throw new Error(
          `Client reactProvider "${reactProvider.id}" in layer "${reactProvider.layer}" cannot declare ordering against reactProvider "${target.id}" in layer "${target.layer}"; before/after constraints may only reference reactProviders in the same layer.`,
        );
      }
    }
  }

  const layerOrder: readonly AppClientReactProviderLayer[] = [
    'root',
    'application',
    'extension',
  ];
  const sorted = layerOrder.flatMap((layer) =>
    sortReactProviderLayer(
      reactProviders.filter((reactProvider) => reactProvider.layer === layer),
    ),
  );
  return Object.freeze(sorted);
}

function sortReactProviderLayer(
  reactProviders: readonly AppClientRegisteredReactProvider[],
): readonly AppClientRegisteredReactProvider[] {
  const reactProvidersById = new Map(
    reactProviders.map((reactProvider) => [reactProvider.id, reactProvider]),
  );
  const registrationIndex = new Map(
    reactProviders.map((reactProvider, index) => [reactProvider.id, index]),
  );
  const outgoing = new Map(
    reactProviders.map((reactProvider) => [
      reactProvider.id,
      new Set<string>(),
    ]),
  );
  const indegree = new Map(
    reactProviders.map((reactProvider) => [reactProvider.id, 0]),
  );

  const addEdge = (from: string, to: string): void => {
    const targets = outgoing.get(from);
    if (!targets || targets.has(to)) {
      return;
    }
    targets.add(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  };

  for (const reactProvider of reactProviders) {
    for (const target of reactProvider.before ?? []) {
      assertReactProviderTarget(reactProvidersById, reactProvider.id, target);
      addEdge(reactProvider.id, target);
    }
    for (const target of reactProvider.after ?? []) {
      assertReactProviderTarget(reactProvidersById, reactProvider.id, target);
      addEdge(target, reactProvider.id);
    }
  }

  const ready = reactProviders
    .filter((reactProvider) => indegree.get(reactProvider.id) === 0)
    .map((reactProvider) => reactProvider.id);
  const sorted: AppClientRegisteredReactProvider[] = [];

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
    const reactProvider = reactProvidersById.get(id);
    if (!reactProvider) {
      continue;
    }
    sorted.push(reactProvider);

    for (const target of outgoing.get(id) ?? []) {
      const nextIndegree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, nextIndegree);
      if (nextIndegree === 0) {
        ready.push(target);
      }
    }
  }

  if (sorted.length !== reactProviders.length) {
    const cycle = findReactProviderCycle(reactProviders, outgoing);
    throw new Error(
      `Circular client reactProvider order detected: ${cycle.join(' -> ')}.`,
    );
  }

  return Object.freeze(sorted);
}

function assertReactProviderTarget(
  reactProvidersById: ReadonlyMap<string, AppClientRegisteredReactProvider>,
  reactProviderId: string,
  targetId: string,
): void {
  if (!reactProvidersById.has(targetId)) {
    throw new Error(
      `Client reactProvider "${reactProviderId}" references missing reactProvider "${targetId}".`,
    );
  }
}

function findReactProviderCycle(
  reactProviders: readonly AppClientRegisteredReactProvider[],
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

  for (const reactProvider of reactProviders) {
    const cycle = visit(reactProvider.id);
    if (cycle) {
      return cycle;
    }
  }

  return reactProviders.map((reactProvider) => reactProvider.id);
}
