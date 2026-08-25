import type { AppClient } from '@nocobase/app-sdk';
import type { ComponentType } from 'react';

import type { AppClientProvider, AppClientRefineConfig } from './config.js';

const CONTRIBUTION_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const RESERVED_APPLICATION_ROUTE_PATHS = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
]);

export type AppClientRouteAuth = 'required' | 'guest' | 'optional';

export type AppClientRouteSurface = 'application' | 'standalone';

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
  readonly surface?: AppClientRouteSurface;
  readonly componentLoader: AppClientRouteComponentLoader;
}

export interface AppClientRegisteredRoute extends AppClientRouteDefinition {
  readonly auth: AppClientRouteAuth;
  readonly id: string;
  readonly packageName: string;
  readonly source: AppClientContributionSource;
  readonly surface: AppClientRouteSurface;
}

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

export interface AppClientBootstrapContext {
  readonly appClient: AppClient;
  readonly packageName: string;
  readonly refine: AppClientRefineRegistry;
  readonly source: AppClientContributionSource;
}

export type AppClientBootstrap = (
  context: AppClientBootstrapContext,
) => void | Promise<void>;

export type AppClientPluginBootstrapContext = AppClientBootstrapContext;

export type AppClientPluginBootstrap = AppClientBootstrap;

export interface AppClientBootstrapModule {
  default: AppClientBootstrap;
}

export type AppClientPluginBootstrapModule = AppClientBootstrapModule;

export interface AppClientRoutesModule {
  default: readonly AppClientRouteDefinition[];
}

export interface AppClientProvidersModule {
  default: readonly AppClientProviderDefinition[];
}

export type AppClientBootstrapLoader = () => Promise<AppClientBootstrapModule>;

export type AppClientPluginBootstrapLoader = AppClientBootstrapLoader;

export type AppClientRoutesLoader = () => Promise<AppClientRoutesModule>;

export type AppClientProvidersLoader = () => Promise<AppClientProvidersModule>;

export interface AppClientContributionLoader {
  readonly packageName: string;
  readonly loadBootstrap?: AppClientBootstrapLoader;
  readonly loadRoutes?: AppClientRoutesLoader;
  readonly loadProviders?: AppClientProvidersLoader;
}

export interface AppClientApplicationLoader extends AppClientContributionLoader {
  readonly source: 'application';
}

export interface AppClientPluginLoader extends AppClientContributionLoader {
  readonly source?: 'plugin';
}

export interface AppClientContributions {
  readonly packageName: string;
  readonly source?: AppClientContributionSource;
  readonly routes?: readonly AppClientRouteDefinition[];
  readonly providers?: readonly AppClientProviderDefinition[];
}

export type AppClientPluginContributions = AppClientContributions;

export interface ResolvedAppClientContributions {
  readonly routes: readonly AppClientRegisteredRoute[];
  readonly providers: readonly AppClientRegisteredProvider[];
}

export function defineClientApplication(
  application: AppClientContributionLoader,
): AppClientApplicationLoader {
  return Object.freeze({ ...application, source: 'application' });
}

export function defineClientRoutes(
  routes: readonly AppClientRouteDefinition[],
): readonly AppClientRouteDefinition[] {
  return Object.freeze(routes.map((route) => Object.freeze({ ...route })));
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
  const routePaths = new Map<string, AppClientRegisteredRoute>();
  const providers: AppClientRegisteredProvider[] = [];
  const providerIds = new Set<string>();

  for (const contribution of contributions) {
    const packageName = normalizePackageName(contribution.packageName);
    const source = normalizeContributionSource(contribution.source);

    for (const route of contribution.routes ?? []) {
      const registeredRoute = createRegisteredRoute(packageName, source, route);
      if (routeIds.has(registeredRoute.id)) {
        throw new Error(
          `Plugin "${packageName}" defined duplicate client route name "${registeredRoute.name}".`,
        );
      }

      const pathSignature = createRoutePathSignature(registeredRoute.path);
      const existingRoute = routePaths.get(pathSignature);
      if (existingRoute) {
        throw new Error(
          `Client route path "${registeredRoute.path}" from plugin "${packageName}" conflicts with route "${existingRoute.id}" at "${existingRoute.path}".`,
        );
      }

      routeIds.add(registeredRoute.id);
      routePaths.set(pathSignature, registeredRoute);
      routes.push(registeredRoute);
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
    providers: sortProviders(providers),
  });
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

function createRegisteredRoute(
  packageName: string,
  source: AppClientContributionSource,
  route: AppClientRouteDefinition,
): AppClientRegisteredRoute {
  const name = normalizeContributionName(route.name, packageName, 'route');
  const path = normalizeRoutePath(route.path, packageName, name);
  const auth = normalizeRouteAuth(route.auth, packageName, name);
  const surface = normalizeRouteSurface(route.surface, packageName, name);
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
    componentLoader: wrapRouteComponentLoader(route.componentLoader, id),
    id,
    name,
    packageName,
    path,
    source,
    surface,
  });
}

function normalizeRouteSurface(
  surface: AppClientRouteSurface | undefined,
  packageName: string,
  routeName: string,
): AppClientRouteSurface {
  const normalized = surface ?? 'application';
  if (normalized !== 'application' && normalized !== 'standalone') {
    throw new Error(
      `Client route "${routeName}" from plugin "${packageName}" must use surface "application" or "standalone".`,
    );
  }
  return normalized;
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
  routeId: string,
): AppClientRouteComponentLoader {
  return async () => {
    try {
      const module = await componentLoader();
      if (typeof module.default !== 'function') {
        throw new Error(
          'The route component module must default-export a React component.',
        );
      }
      return module;
    } catch (error) {
      throw new Error(`Failed to load client route "${routeId}".`, {
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
