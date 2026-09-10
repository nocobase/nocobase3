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

export interface AppClientRoutePageDefinition {
  readonly name: string;
  readonly path: string;
  readonly auth?: AppClientRouteAuth;
  readonly access?: { readonly resource: string; readonly action: string };
  readonly navigation?: AppClientSettingsRouteNavigation;
  readonly componentLoader: AppClientRouteComponentLoader;
  readonly children?: readonly AppClientRouteDefinition[];
}

export interface AppClientRouteGroupDefinition {
  readonly name: string;
  readonly path?: string;
  readonly auth?: AppClientRouteAuth;
  readonly navigation: AppClientSettingsRouteNavigation;
  readonly children: readonly AppClientRouteDefinition[];
  readonly componentLoader?: never;
}

export type AppClientRouteDefinition =
  AppClientRoutePageDefinition | AppClientRouteGroupDefinition;

export interface AppClientRegisteredRoute {
  readonly name: string;
  readonly path: string;
  readonly auth: AppClientRouteAuth;
  readonly access?: { readonly resource: string; readonly action: string };
  readonly navigation?: AppClientSettingsRouteNavigation;
  readonly componentLoader?: AppClientRouteComponentLoader;
  readonly children?: readonly AppClientRegisteredRoute[];
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
  readonly children?: readonly AppClientSettingsRouteDefinition[];
}

/**
 * A group of settings pages. It carries the icon and title once for the whole section, so its children do not repeat
 * them. Children may be pages or further navigation groups.
 */
export interface AppClientSettingsRouteGroupDefinition {
  readonly name: string;
  /** Path segment relative to the built-in Settings Route. */
  readonly path?: string;
  readonly navigation: AppClientSettingsRouteNavigation;
  readonly componentLoader?: never;
  readonly children: readonly AppClientSettingsRouteDefinition[];
}

/** A child Route contributed to the built-in Settings Route. */
export type AppClientSettingsRouteDefinition =
  AppClientSettingsRoutePageDefinition | AppClientSettingsRouteGroupDefinition;

export function isAppClientSettingsRouteGroup(
  route: AppClientSettingsRouteDefinition,
): route is AppClientSettingsRouteGroupDefinition {
  return !('componentLoader' in route);
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
  readonly settingsRouteTree: readonly AppClientRegisteredRoute[];
  readonly devRouteTree: readonly AppClientRegisteredRoute[];
  /** Flat page projection for tooling. Routers render settingsRouteTree. */
  readonly settings: readonly AppClientRegisteredSetting[];
  /** Flat group projection for tooling. Navigation is derived from settingsRouteTree. */
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
    routes: freezeNavigationRoutes(routes),
  });
}

function freezeNavigationRoutes<
  T extends AppClientRouteDefinition | AppClientSettingsRouteDefinition,
>(routes: readonly T[]): readonly T[] {
  return Object.freeze(
    routes.map((route) =>
      Object.freeze({
        ...route,
        ...(route.navigation
          ? { navigation: Object.freeze({ ...route.navigation }) }
          : {}),
        ...(route.children
          ? { children: freezeNavigationRoutes(route.children) }
          : {}),
      }),
    ) as unknown as T[],
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
  const settingsRouteTree: AppClientRegisteredRoute[] = [];
  const devRouteTree: AppClientRegisteredRoute[] = [];
  const routeIds = new Map<string, string>();
  // Routes and settings share one path space: a setting is mounted at `/settings/<id>`, which a route is free to
  // declare too. Both register here so the collision is reported whichever one the resolver reaches first.
  const claimedPaths = new Map<string, ClaimedPath>();
  const settings: AppClientRegisteredSetting[] = [];
  const settingGroups: AppClientRegisteredSettingGroup[] = [];
  const devRoutes: AppClientRegisteredDevRoute[] = [];
  const devRouteGroups: AppClientRegisteredDevRouteGroup[] = [];
  const reactProviders: AppClientRegisteredReactProvider[] = [];
  const reactProviderIds = new Set<string>();

  for (const contribution of contributions) {
    const packageName = normalizePackageName(contribution.packageName);
    const source = normalizeContributionSource(contribution.source);

    const routeContributions = normalizeRouteContributions(contribution.routes);
    for (const routeContribution of routeContributions) {
      const surface = routeContribution.parent;
      const tree = resolveRouteTree(
        routeContribution.routes,
        packageName,
        source,
        surface,
        surface === 'app' ? '' : `/${surface}`,
        undefined,
        routeIds,
        claimedPaths,
      );
      if (surface === 'app') {
        routes.push(...tree);
      } else {
        const targetTree = surface === 'dev' ? devRouteTree : settingsRouteTree;
        targetTree.push(...tree);
        const pages = surface === 'dev' ? devRoutes : settings;
        const groups = surface === 'dev' ? devRouteGroups : settingGroups;
        const project = (
          nodes: readonly AppClientRegisteredRoute[],
          groupId?: string,
        ): AppClientRegisteredSetting[] =>
          nodes.flatMap((node) => {
            if (!node.componentLoader) {
              const children = project(node.children ?? [], node.id);
              groups.push(
                Object.freeze({
                  id: node.id,
                  title: node.navigation!.title,
                  ...(node.navigation?.icon
                    ? { icon: node.navigation.icon }
                    : {}),
                  surface,
                  packageName,
                  source,
                  settings: Object.freeze(children),
                }),
              );
              return children;
            }
            const setting: AppClientRegisteredSetting = Object.freeze({
              id: node.id,
              path: node.path,
              title: node.navigation?.title ?? node.name,
              navigation: !!node.navigation,
              surface,
              packageName,
              source,
              pageLoader: node.componentLoader,
              ...(node.access ? { access: node.access } : {}),
              ...(node.navigation?.icon ? { icon: node.navigation.icon } : {}),
              ...(groupId ? { groupId } : {}),
            });
            return [setting, ...project(node.children ?? [], groupId)];
          });
        pages.push(...project(tree));
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
    settingsRouteTree: Object.freeze(settingsRouteTree),
    devRouteTree: Object.freeze(devRouteTree),
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
  const flatten = (
    nodes: readonly AppClientRegisteredRoute[],
  ): AppClientRegisteredRoute[] =>
    nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
  const routesById = new Map(flatten(routes).map((route) => [route.id, route]));
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
    if (!routesById.get(routeId)?.componentLoader)
      throw new Error(
        `Client route component override cannot target group "${routeId}".`,
      );
    if (typeof override.componentLoader !== 'function') {
      throw new Error(
        `Client route component override for "${routeId}" must define a componentLoader function.`,
      );
    }
    loadersByRouteId.set(routeId, override.componentLoader);
  }

  const replace = (
    nodes: readonly AppClientRegisteredRoute[],
  ): readonly AppClientRegisteredRoute[] =>
    Object.freeze(
      nodes.map((route) => {
        const loader = loadersByRouteId.get(route.id);
        return Object.freeze({
          ...route,
          ...(loader
            ? { componentLoader: wrapRouteComponentLoader(loader, route.id) }
            : {}),
          ...(route.children ? { children: replace(route.children) } : {}),
        });
      }),
    );
  return replace(routes);
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
  readonly packageName: string;
}

/** Names a surface for error messages, so a dev route never reports itself as a setting. */
function describeSurface(surface: AppClientNavigationSurface): string {
  return surface === 'dev' ? 'dev route' : 'setting';
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

function resolveRouteTree(
  definitions: readonly (
    AppClientRouteDefinition | AppClientSettingsRouteDefinition
  )[],
  packageName: string,
  source: AppClientContributionSource,
  surface: 'app' | AppClientNavigationSurface,
  parentPath: string,
  parentAuth: AppClientRouteAuth | undefined,
  ids: Map<string, string>,
  claimed: Map<string, ClaimedPath>,
): readonly AppClientRegisteredRoute[] {
  const siblingNames = new Set<string>();
  return Object.freeze(
    definitions.map((route) => {
      const name =
        surface === 'app'
          ? normalizeContributionName(route.name, packageName, 'route')
          : normalizeSettingId(
              route.name,
              packageName,
              describeSurface(surface),
            );
      const id = surface === 'app' ? `${packageName}:${name}` : name;
      if (
        surface !== 'app' &&
        parentAuth !== undefined &&
        siblingNames.has(name)
      ) {
        throw new Error(
          `Client ${describeSurface(surface)} group defines duplicate child id "${id}".`,
        );
      }
      siblingNames.add(name);
      const isPage = typeof route.componentLoader === 'function';
      if ('componentLoader' in route && !isPage)
        throw new Error(
          `Client route "${id}" must define a componentLoader function.`,
        );
      const kind = surface === 'app' ? 'route' : describeSurface(surface);
      if (!isPage && !route.children)
        throw new Error(
          `Client ${kind} "${id}" must define a componentLoader function.`,
        );
      if (!isPage && (!route.navigation || !route.children?.length))
        throw new Error(
          `Client ${kind} group "${id}" must define at least one child and navigation.`,
        );
      const rawPath = route.path;
      if (isPage && rawPath === undefined)
        throw new Error(`Client route "${id}" must define a path.`);
      const relative =
        rawPath === undefined
          ? ''
          : normalizeRoutePath(
              parentPath ? '/' + rawPath.replace(/^\/+/, '') : rawPath,
              packageName,
              name,
            );
      const path =
        `${parentPath.replace(/\/$/, '')}${relative === '/' && parentPath ? '' : relative}` ||
        '/';
      const declaredAuth = 'auth' in route ? route.auth : undefined;
      if (parentAuth && declaredAuth && parentAuth !== declaredAuth)
        throw new Error(
          `Client route "${id}" cannot change inherited auth "${parentAuth}".`,
        );
      const auth = normalizeRouteAuth(
        parentAuth ?? declaredAuth,
        packageName,
        name,
      );
      if (
        surface === 'app' &&
        isPage &&
        path === '/' &&
        source !== 'application'
      )
        throw new Error(
          `Client route "${name}" from plugin "${packageName}" cannot use reserved application root path "/".`,
        );
      if (
        surface === 'app' &&
        RESERVED_APPLICATION_ROUTE_PATHS.has(path.toLowerCase()) &&
        auth !== 'guest'
      )
        throw new Error(
          `Client route "${name}" cannot use reserved path "${path}" unless auth is "guest".`,
        );
      const navigation = route.navigation
        ? Object.freeze({
            ...route.navigation,
            title: normalizeSettingTitle(
              route.navigation.title,
              id,
              packageName,
              'route',
            ),
          })
        : undefined;
      if (
        navigation &&
        isPage &&
        path
          .split('/')
          .some((segment) => segment.startsWith(':') || segment.includes('*'))
      )
        throw new Error(
          `Client route "${id}" navigation requires a static path.`,
        );
      if (isPage) {
        const signature = createRoutePathSignature(path);
        const previous = claimed.get(signature);
        if (
          previous &&
          surface !== 'app' &&
          previous.kind === kind &&
          previous.path === path
        )
          throw new Error(
            `Client ${kind} "${path}" from plugin "${packageName}" is already registered by "${previous.packageName}".`,
          );
        if (previous)
          throw new Error(
            `Client route path "${path}" from plugin "${packageName}" conflicts with ${previous.kind} "${previous.id}" at "${previous.path}"; already registered.`,
          );
        claimed.set(signature, {
          id,
          path,
          packageName,
          kind:
            surface === 'app'
              ? 'route'
              : surface === 'dev'
                ? 'dev route'
                : 'setting',
        });
      }
      // App names identify override targets across the package. Settings/Dev group
      // names are surface-wide; page names retain their historical sibling scope.
      if (surface === 'app' || !isPage) {
        const identity = `${surface}:${id}`;
        const duplicate = ids.get(identity);
        if (duplicate) {
          if (surface !== 'app') {
            throw new Error(
              `Client ${kind} group "${id}" from plugin "${packageName}" is already registered by "${duplicate}".`,
            );
          }
          throw new Error(
            `Plugin "${packageName}" defined duplicate client route name "${name}".`,
          );
        }
        ids.set(identity, packageName);
      }
      return Object.freeze({
        id,
        name,
        path,
        auth,
        packageName,
        source,
        ...(navigation ? { navigation } : {}),
        ...('access' in route && route.access ? { access: route.access } : {}),
        ...(isPage
          ? {
              componentLoader: wrapRouteComponentLoader(
                route.componentLoader,
                id,
                surface === 'app' ? 'route' : describeSurface(surface),
              ),
            }
          : {}),
        ...(route.children
          ? {
              children: resolveRouteTree(
                route.children,
                packageName,
                source,
                surface,
                path,
                auth,
                ids,
                claimed,
              ),
            }
          : {}),
      });
    }),
  );
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
