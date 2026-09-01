import type { DatabaseConnection } from '@nocobase/db';
import type { AuthorizationGrantService } from './grants.js';
import type { ResourceHandlerRegistry } from './registry.js';
import type { AuthorizationMiddleware } from './middleware.js';
import type { AccessConstraintRegistry } from './constraints.js';

export interface AuthorizationPluginSetup {
  readonly connection?: DatabaseConnection;
  readonly grants: AuthorizationGrantService;
  readonly resources: ResourceHandlerRegistry;
  readonly constraints: AccessConstraintRegistry;
  use(middleware: AuthorizationMiddleware): void;
}

export interface AuthorizationPlugin<
  TAuthorizationApi extends object = object,
> {
  id: string;
  dependencies?: readonly string[];
  /** Supplies the single source of resource grants for this Authorization instance. */
  grants?: AuthorizationGrantService;
  /** Declares that setup and runtime authorization require a Grant Provider. */
  requiresGrants?: boolean;
  /** Adds an authorization-owned API to the created Authorization instance. */
  authorizationApi?: TAuthorizationApi;
  setup?(authz: AuthorizationPluginSetup): void;
}

export type AuthorizationPluginApi<TPlugin> =
  TPlugin extends AuthorizationPlugin<infer TApi> ? TApi : object;

export type AuthorizationPluginApis<
  TPlugins extends readonly AuthorizationPlugin[],
> = UnionToIntersection<AuthorizationPluginApi<TPlugins[number]>>;

type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never;

export function sortAuthorizationPlugins(
  plugins: readonly AuthorizationPlugin[],
): AuthorizationPlugin[] {
  const byId = new Map<string, AuthorizationPlugin>();
  let grantProvider: AuthorizationPlugin | undefined;
  for (const plugin of plugins) {
    if (byId.has(plugin.id)) {
      throw new Error(`Authorization plugin already installed: ${plugin.id}`);
    }
    byId.set(plugin.id, plugin);
    if (plugin.grants) {
      if (grantProvider) {
        throw new Error(
          `Authorization has multiple Grant Providers: ${grantProvider.id}, ${plugin.id}`,
        );
      }
      grantProvider = plugin;
    }
  }

  for (const plugin of plugins) {
    for (const dependency of plugin.dependencies ?? []) {
      if (!byId.has(dependency)) {
        throw new Error(
          `Authorization plugin "${plugin.id}" requires missing plugin "${dependency}"`,
        );
      }
    }
    if (plugin.requiresGrants && !grantProvider) {
      throw new Error(
        `Authorization plugin "${plugin.id}" requires a Grant Provider`,
      );
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const sorted: AuthorizationPlugin[] = [];
  const visit = (plugin: AuthorizationPlugin): void => {
    if (visited.has(plugin.id)) return;
    if (visiting.has(plugin.id)) {
      throw new Error(`Circular authorization plugin dependency: ${plugin.id}`);
    }
    visiting.add(plugin.id);
    for (const dependency of plugin.dependencies ?? []) {
      visit(byId.get(dependency)!);
    }
    if (plugin.requiresGrants && grantProvider) {
      visit(grantProvider);
    }
    visiting.delete(plugin.id);
    visited.add(plugin.id);
    sorted.push(plugin);
  };
  for (const plugin of plugins) visit(plugin);
  return sorted;
}
