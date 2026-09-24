import type { MiddlewareHandler } from 'hono';
import type { AuthorizationEnv } from './authorization.js';
import type { BusinessCheck, BusinessConditions } from './business.js';
import type { AccessConstraintRegistry } from './constraints.js';
import type { AuthorizationGrantService } from './grants.js';
import type { AuthorizationMiddleware } from './middleware.js';
import type { RecordAccessRegistry } from './record-access.js';
import type { ResourceTypeRegistry } from './resource-types.js';
import type { AuthorizationRouteRegistry } from './routes.js';
import type { ResourceGroupRegistry, SectionRegistry } from './sections.js';
import type { AuthorizationSubjectRegistry } from './subjects.js';

export interface AuthorizationPluginSetup<TConnection = unknown> {
  /** The handle the host passed to `createAuthorization`, never inspected here. */
  readonly connection?: TConnection;
  /** The Grant Provider; reading it without one installed throws. */
  readonly grants: AuthorizationGrantService;
  readonly sections: SectionRegistry;
  readonly groups: ResourceGroupRegistry;
  readonly resourceTypes: ResourceTypeRegistry;
  readonly recordAccess: RecordAccessRegistry;
  readonly constraints: AccessConstraintRegistry;
  readonly subjects: AuthorizationSubjectRegistry;
  readonly routes: AuthorizationRouteRegistry;
  use(middleware: AuthorizationMiddleware): void;
  middleware(): MiddlewareHandler<AuthorizationEnv>;
}

export interface AuthorizationPlugin<
  TAuthorizationApi extends object = object,
  TConnection = unknown,
  TRequiredApi extends object = object,
> {
  id: string;
  dependencies?: readonly string[];
  /** Supplies the single source of grants for this Authorization instance. */
  grants?: AuthorizationGrantService;
  /** Declares that setup and runtime authorization require a Grant Provider. */
  requiresGrants?: boolean;
  /** Members added to the created Authorization instance. */
  authorizationApi?: TAuthorizationApi;
  /** Turns the resolved checks of a business action into plugin conditions. */
  composeConditions?(
    checks: readonly BusinessCheck[],
  ): Partial<Omit<BusinessConditions, 'type' | 'checks'>>;
  /**
   * Receives the registries plus every installed plugin's API; `TRequiredApi`
   * types the APIs this plugin needs, whose plugins it lists in `dependencies`.
   */
  setup?(authz: AuthorizationPluginSetup<TConnection> & TRequiredApi): void;
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

/** Orders plugins so dependencies and the Grant Provider set up first. */
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
