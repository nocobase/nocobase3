import type {
  AppClientPluginLoader,
  AppClientRegisteredRoute,
  AppClientRouteComponentLoader,
  AppClientRouteRegistration,
  AppClientRouteRegistry,
} from '@nocobase/app-client/plugins';
import { createAppClient, type AppClient } from '@nocobase/app-sdk';
import { dataProvider } from '@nocobase/portal-sdk/data';
import { getPortalBase } from '@nocobase/portal-sdk/runtime';
import type { AuthProvider, DataProvider } from '@refinedev/core';

export interface AppClientRuntime {
  readonly appClient: AppClient;
  readonly authProvider: AuthProvider;
  readonly basename: string;
  readonly dataProvider: DataProvider;
  readonly routes: readonly AppClientRegisteredRoute[];
}

export interface CreateAppRuntimeOptions {
  readonly plugins: readonly AppClientPluginLoader[];
}

export async function createAppRuntime(
  options: CreateAppRuntimeOptions,
): Promise<AppClientRuntime> {
  const appClient = createAppClient();
  const loadedPlugins = await Promise.all(
    options.plugins.map(async (plugin) => {
      try {
        const module = await plugin.load();
        if (typeof module.default !== 'function') {
          throw new Error(
            'The bootstrap module must default-export a function.',
          );
        }
        return { packageName: plugin.packageName, bootstrap: module.default };
      } catch (error) {
        throw new Error(
          `Failed to load client plugin "${plugin.packageName}".`,
          { cause: error },
        );
      }
    }),
  );
  let authProvider: AuthProvider | undefined;
  let authProviderOwner: string | undefined;
  const registeredRoutes: AppClientRegisteredRoute[] = [];
  const routeIds = new Set<string>();
  const routePaths = new Map<string, AppClientRegisteredRoute>();

  for (const plugin of loadedPlugins) {
    const routeRegistry = createPluginRouteRegistry({
      packageName: plugin.packageName,
      registeredRoutes,
      routeIds,
      routePaths,
    });

    try {
      await plugin.bootstrap({
        appClient,
        packageName: plugin.packageName,
        refine: {
          setAuthProvider(provider): void {
            if (authProvider) {
              throw new Error(
                `Auth provider is already registered by "${authProviderOwner}".`,
              );
            }
            authProvider = provider;
            authProviderOwner = plugin.packageName;
          },
        },
        routes: routeRegistry.registry,
      });
    } catch (error) {
      throw new Error(
        `Failed to bootstrap client plugin "${plugin.packageName}".`,
        { cause: error },
      );
    } finally {
      routeRegistry.close();
    }
  }

  if (!authProvider) {
    throw new Error(
      'Default App requires an enabled client plugin that registers an auth provider.',
    );
  }

  return {
    appClient,
    authProvider,
    basename: getPortalBase(),
    dataProvider,
    routes: Object.freeze([...registeredRoutes]),
  };
}

interface CreatePluginRouteRegistryOptions {
  readonly packageName: string;
  readonly registeredRoutes: AppClientRegisteredRoute[];
  readonly routeIds: Set<string>;
  readonly routePaths: Map<string, AppClientRegisteredRoute>;
}

interface PluginRouteRegistryController {
  readonly registry: AppClientRouteRegistry;
  close(): void;
}

function createPluginRouteRegistry(
  options: CreatePluginRouteRegistryOptions,
): PluginRouteRegistryController {
  let open = true;

  return {
    registry: {
      add(route): void {
        if (!open) {
          throw new Error(
            `Client routes for plugin "${options.packageName}" can only be registered during bootstrap.`,
          );
        }

        const registeredRoute = createRegisteredRoute(
          options.packageName,
          route,
        );
        if (options.routeIds.has(registeredRoute.id)) {
          throw new Error(
            `Plugin "${options.packageName}" registered duplicate route name "${registeredRoute.name}".`,
          );
        }

        const pathSignature = createRoutePathSignature(registeredRoute.path);
        const existingRoute = options.routePaths.get(pathSignature);
        if (existingRoute) {
          throw new Error(
            `Client route path "${registeredRoute.path}" from plugin "${options.packageName}" conflicts with route "${existingRoute.id}" at "${existingRoute.path}".`,
          );
        }

        options.routeIds.add(registeredRoute.id);
        options.routePaths.set(pathSignature, registeredRoute);
        options.registeredRoutes.push(registeredRoute);
      },
    },
    close(): void {
      open = false;
    },
  };
}

function createRegisteredRoute(
  packageName: string,
  route: AppClientRouteRegistration,
): AppClientRegisteredRoute {
  const name = normalizeRouteName(route.name, packageName);
  const path = normalizeRoutePath(route.path, packageName, name);
  if (typeof route.componentLoader !== 'function') {
    throw new Error(
      `Client route "${name}" from plugin "${packageName}" must define a componentLoader function.`,
    );
  }

  const id = `${packageName}:${name}`;
  const componentLoader = wrapRouteComponentLoader(route.componentLoader, id);

  return Object.freeze({
    componentLoader,
    id,
    name,
    packageName,
    path,
  });
}

function normalizeRouteName(name: string, packageName: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error(
      `Client route from plugin "${packageName}" must define a non-empty name.`,
    );
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(normalized)) {
    throw new Error(
      `Client route name "${name}" from plugin "${packageName}" contains unsupported characters.`,
    );
  }
  return normalized;
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
