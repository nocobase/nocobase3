import type { AppClient } from '@nocobase/app-sdk';
import type { AuthProvider } from '@refinedev/core';
import type { ComponentType } from 'react';

import type { AppClientProvider } from './config.js';

const CONTRIBUTION_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

export interface AppClientRouteComponentModule {
  default: ComponentType;
}

export type AppClientRouteComponentLoader =
  () => Promise<AppClientRouteComponentModule>;

export interface AppClientRouteDefinition {
  readonly name: string;
  readonly path: string;
  readonly componentLoader: AppClientRouteComponentLoader;
}

export interface AppClientRegisteredRoute extends AppClientRouteDefinition {
  readonly id: string;
  readonly packageName: string;
}

export interface AppClientProviderDefinition {
  readonly name: string;
  readonly component: AppClientProvider;
  readonly before?: readonly string[];
  readonly after?: readonly string[];
}

export interface AppClientRegisteredProvider extends AppClientProviderDefinition {
  readonly id: string;
  readonly packageName: string;
}

export interface AppClientRefineRegistry {
  setAuthProvider(provider: AuthProvider): void;
}

export interface AppClientPluginBootstrapContext {
  readonly appClient: AppClient;
  readonly packageName: string;
  readonly refine: AppClientRefineRegistry;
}

export type AppClientPluginBootstrap = (
  context: AppClientPluginBootstrapContext,
) => void | Promise<void>;

export interface AppClientPluginBootstrapModule {
  default: AppClientPluginBootstrap;
}

export interface AppClientRoutesModule {
  default: readonly AppClientRouteDefinition[];
}

export interface AppClientProvidersModule {
  default: readonly AppClientProviderDefinition[];
}

export type AppClientPluginBootstrapLoader =
  () => Promise<AppClientPluginBootstrapModule>;

export type AppClientRoutesLoader = () => Promise<AppClientRoutesModule>;

export type AppClientProvidersLoader = () => Promise<AppClientProvidersModule>;

export interface AppClientPluginLoader {
  readonly packageName: string;
  readonly loadBootstrap?: AppClientPluginBootstrapLoader;
  readonly loadRoutes?: AppClientRoutesLoader;
  readonly loadProviders?: AppClientProvidersLoader;
}

export interface AppClientPluginContributions {
  readonly packageName: string;
  readonly routes?: readonly AppClientRouteDefinition[];
  readonly providers?: readonly AppClientProviderDefinition[];
}

export interface ResolvedAppClientContributions {
  readonly routes: readonly AppClientRegisteredRoute[];
  readonly providers: readonly AppClientRegisteredProvider[];
}

export function defineClientRoutes(
  routes: readonly AppClientRouteDefinition[],
): readonly AppClientRouteDefinition[] {
  return Object.freeze(routes.map((route) => Object.freeze({ ...route })));
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
  contributions: readonly AppClientPluginContributions[],
): ResolvedAppClientContributions {
  const routes: AppClientRegisteredRoute[] = [];
  const routeIds = new Set<string>();
  const routePaths = new Map<string, AppClientRegisteredRoute>();
  const providers: AppClientRegisteredProvider[] = [];
  const providerIds = new Set<string>();

  for (const contribution of contributions) {
    const packageName = normalizePackageName(contribution.packageName);

    for (const route of contribution.routes ?? []) {
      const registeredRoute = createRegisteredRoute(packageName, route);
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

function freezeOptionalList(
  values: readonly string[] | undefined,
): readonly string[] | undefined {
  return values ? Object.freeze([...values]) : undefined;
}

function normalizePackageName(packageName: string): string {
  const normalized = packageName.trim();
  if (!normalized) {
    throw new Error('A client contribution must define a package name.');
  }
  return normalized;
}

function createRegisteredRoute(
  packageName: string,
  route: AppClientRouteDefinition,
): AppClientRegisteredRoute {
  const name = normalizeContributionName(route.name, packageName, 'route');
  const path = normalizeRoutePath(route.path, packageName, name);
  if (typeof route.componentLoader !== 'function') {
    throw new Error(
      `Client route "${name}" from plugin "${packageName}" must define a componentLoader function.`,
    );
  }

  const id = `${packageName}:${name}`;
  return Object.freeze({
    componentLoader: wrapRouteComponentLoader(route.componentLoader, id),
    id,
    name,
    packageName,
    path,
  });
}

function createRegisteredProvider(
  packageName: string,
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

  return Object.freeze({
    id: `${packageName}:${name}`,
    name,
    packageName,
    component: provider.component,
    before: normalizeProviderTargets(provider.before, packageName, name),
    after: normalizeProviderTargets(provider.after, packageName, name),
  });
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
  if (normalized === '/' || normalized.toLowerCase() === '/login') {
    throw new Error(
      `Client route "${routeName}" from plugin "${packageName}" cannot use reserved path "${normalized}".`,
    );
  }
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
