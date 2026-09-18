import {
  type ResourceAuthorizationConditions,
  type ResourceAuthorizationCheck,
  BusinessResourceGroups,
  BusinessResources,
  composedGrants,
} from './business-resources.js';
import {
  ResourceHandlerRegistry,
  type AuthorizationResourceItems,
  type RegisteredResource,
} from './registry.js';
import { AuthorizationSubjectRegistry } from './subjects.js';
import { AuthorizationRouteRegistry } from './routes.js';
import { AccessConstraintRegistry } from './constraints.js';
import type { AccessConstraintService } from './constraints.js';
import {
  sortAuthorizationPlugins,
  type AuthorizationPluginApis,
  type AuthorizationPlugin,
} from './plugin.js';
import type {
  AuthorizationGrantService,
  AuthorizationGrantsChangedListener,
} from './grants.js';
import {
  createAuthorizationPermissionsApi,
  type AuthorizationPermission,
  type AuthorizationPermissionsApi,
  type AuthorizationPermissionsSnapshot,
} from './permissions.js';
import type { MiddlewareHandler } from 'hono';
import type { Context } from 'hono';
import {
  createAuthorizationMiddlewareRequest,
  runAuthorizationMiddlewares,
  type AuthorizationMiddleware,
} from './middleware.js';
import {
  AuthorizationDeniedError,
  type AuthorizationDecision,
  type AuthorizationDescription,
  type AuthorizationReason,
  type AuthorizationRequest,
  type AuthorizationIdentity,
} from './types.js';

export interface AuthorizationScope {
  readonly identity: AuthorizationIdentity;
  authorize(
    request: Omit<
      AuthorizationRequest,
      'principal' | 'subjects' | 'resource'
    > & { resource: { type: 'resource'; id: string } },
  ): Promise<AuthorizationDecision<ResourceAuthorizationConditions>>;
  authorize<TParams = undefined>(
    request: Omit<AuthorizationRequest<TParams>, 'principal' | 'subjects'>,
  ): Promise<AuthorizationDecision>;
  /** Feature visibility for composed operations; data conditions still require enforcement. */
  can<TParams = undefined>(
    request: Omit<AuthorizationRequest<TParams>, 'principal' | 'subjects'>,
  ): Promise<boolean>;
  require<TParams = undefined>(
    request: Omit<AuthorizationRequest<TParams>, 'principal' | 'subjects'>,
  ): Promise<void>;
  explain<TParams = undefined>(
    request: Omit<AuthorizationRequest<TParams>, 'principal' | 'subjects'>,
  ): Promise<AuthorizationDecision>;
  permissions(): Promise<AuthorizationPermissionsSnapshot>;
}

export interface AuthorizationEnv {
  Variables: { authz: AuthorizationScope };
}

export interface AuthorizationGuardEnv<TVariables extends object = object> {
  Variables: TVariables & AuthorizationEnv['Variables'];
}

export type AuthorizationGuardRequest<TParams = undefined> = Omit<
  AuthorizationRequest<TParams>,
  'principal' | 'subjects'
>;

export type AuthorizationGuardResolver<
  TParams = undefined,
  TVariables extends object = object,
> = (
  http: Context<AuthorizationGuardEnv<TVariables>>,
) =>
  | AuthorizationGuardRequest<TParams>
  | Promise<AuthorizationGuardRequest<TParams>>;

export interface CreateAuthorizationOptions<
  TPlugins extends readonly AuthorizationPlugin[],
  TConnection = unknown,
> {
  /** Passed through to every plugin's setup; the library never inspects it. */
  connection?: TConnection;
  plugins: TPlugins;
}

interface AuthorizationOptions {
  connection?: unknown;
  plugins: readonly AuthorizationPlugin[];
}

export class Authorization {
  private readonly plugins: readonly AuthorizationPlugin[];
  readonly resources: BusinessResources;
  readonly resourceTypes: ResourceHandlerRegistry;
  readonly resourceGroups: BusinessResourceGroups =
    new BusinessResourceGroups();
  readonly constraints: AccessConstraintRegistry;
  readonly subjects: AuthorizationSubjectRegistry;
  readonly routes: AuthorizationRouteRegistry;
  readonly permissions: AuthorizationPermissionsApi;
  private readonly grants: AuthorizationGrantService;
  private readonly grantProvider?: string;
  private readonly middlewares: AuthorizationMiddleware[] = [];

  constructor(options: AuthorizationOptions) {
    this.resources = new BusinessResources(this.resourceGroups);
    this.resourceTypes = new ResourceHandlerRegistry();
    this.constraints = new AccessConstraintRegistry();
    this.subjects = new AuthorizationSubjectRegistry();
    this.routes = new AuthorizationRouteRegistry();
    this.permissions = createAuthorizationPermissionsApi();
    this.plugins = sortAuthorizationPlugins(options.plugins);
    const grantProvider = this.plugins.find((plugin) => plugin.grants);
    this.grants = composedGrants(
      grantProvider?.grants ?? this.createMissingGrantService(),
      this.resources,
      this.constraints,
    );
    this.grantProvider = grantProvider?.id;
    this.resourceTypes.add({
      resourceType: 'resource',
      async authorize(request, context) {
        const grants = await context.grants.resolve(request);
        return {
          effect: grants.length ? 'permit' : 'deny',
          reasons: grants.length
            ? grants.map((grant) => ({
                code: 'GRANT_MATCHED',
                message: `${grant.source.plugin}:${grant.source.id} allows ${request.resource.id}.${request.action}`,
                plugin: 'resource',
                details: { source: grant.source, policy: grant.policy },
              }))
            : [
                {
                  code: 'NO_OBJECT_PERMISSION',
                  message: 'No permission set grants this operation',
                  plugin: 'resource',
                },
              ],
        };
      },
    });
    this.installApis();
    for (const plugin of this.plugins) {
      plugin.setup?.({
        ...(options.connection === undefined
          ? {}
          : { connection: options.connection }),
        get grants(): AuthorizationGrantService {
          if (!grantProvider?.grants) {
            throw new Error(
              `Authorization plugin "${plugin.id}" accessed grants without a Grant Provider`,
            );
          }
          return grantProvider.grants;
        },
        resources: this.resources,
        resourceTypes: this.resourceTypes,
        resourceGroups: this.resourceGroups,
        getResource: this.resourceTypes.getResource.bind(this.resourceTypes),
        constraints: this.constraints,
        subjects: this.subjects,
        routes: this.routes,
        use: (middleware): void => {
          this.use(middleware);
        },
      });
    }
  }

  getResource<T extends keyof AuthorizationResourceItems>(
    type: T,
  ): RegisteredResource<AuthorizationResourceItems[T]>;
  getResource(type: string): RegisteredResource;
  getResource(type: string): RegisteredResource<unknown> {
    return this.resourceTypes.getResource(type);
  }

  /**
   * Registers a step that resolves the request's principal and subjects.
   * `middleware()` runs every registered step before it builds the
   * request-scoped Authorization.
   */
  use(middleware: AuthorizationMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Subscribes to the Grant Provider's own announcement that a subject's
   * grants may have changed. Returns a function that releases the
   * subscription; a provider that announces nothing releases nothing.
   */
  onGrantsChanged(listener: AuthorizationGrantsChangedListener): () => void {
    return this.grants.onChange?.(listener) ?? ((): void => {});
  }

  authorize(
    request: Omit<AuthorizationRequest, 'resource'> & {
      resource: { type: 'resource'; id: string };
    },
  ): Promise<AuthorizationDecision<ResourceAuthorizationConditions>>;
  authorize<TParams = undefined>(
    request: AuthorizationRequest<TParams>,
  ): Promise<AuthorizationDecision>;
  async authorize<TParams = undefined>(
    request: AuthorizationRequest<TParams>,
  ): Promise<AuthorizationDecision> {
    return this.authorizeWithGrants(request, this.grants);
  }

  private async authorizeWithGrants<TParams>(
    request: AuthorizationRequest<TParams>,
    grants: AuthorizationGrantService,
    constraints: AccessConstraintService = this.constraints,
    resolveConditions = true,
  ): Promise<AuthorizationDecision> {
    const handler = this.resourceTypes.get(request.resource.type);
    if (!handler) {
      return this.deny(
        'UNKNOWN_RESOURCE_TYPE',
        `No authorization handler accepts resource type "${request.resource.type}"`,
      );
    }
    try {
      const operation =
        request.resource.type === 'resource'
          ? this.resources.operation(request.resource.id, request.action)
          : undefined;
      if (request.resource.type === 'resource' && !operation)
        return this.deny(
          'RESOURCE_ACTION_NOT_SUPPORTED',
          'Unknown resource or action',
        );
      const finish = async (
        decision: AuthorizationDecision,
      ): Promise<AuthorizationDecision> => {
        if (!operation || !resolveConditions || decision.effect === 'deny')
          return decision;
        const targets = new Map<
          string,
          { resource: AuthorizationRequest['resource']; action: string }
        >();
        for (const grant of operation.grants)
          for (const action of grant.actions)
            targets.set(JSON.stringify([grant.resource, action.action]), {
              resource: grant.resource,
              action: action.action,
            });
        const checks: ResourceAuthorizationCheck[] = await Promise.all(
          [...targets.values()].map(async (target) => ({
            ...target,
            decision: await this.authorizeWithGrants(
              {
                principal: request.principal,
                subjects: request.subjects,
                ...target,
                params: {
                  operation: {
                    resource: request.resource.id,
                    action: request.action,
                  },
                },
              },
              {
                ...grants,
                resolveAll: async (input) =>
                  (await grants.resolveAll(input)).filter(
                    (grant) =>
                      grant.origin?.resource.id === request.resource.id &&
                      grant.origin.action === request.action,
                  ),
                resolve: async (input) =>
                  (await grants.resolve(input)).filter(
                    (grant) =>
                      grant.origin?.resource.id === request.resource.id &&
                      grant.origin.action === request.action,
                  ),
              },
              constraints,
            ),
          })),
        );
        const conditions: ResourceAuthorizationConditions = {
          type: 'resource',
          checks,
        };
        for (const plugin of this.plugins)
          Object.assign(conditions, plugin.composeConditions?.(checks));
        // A denied data branch becomes a deny policy (lists can return no records).
        // Non-data checks, such as page access, must succeed outright.
        const denied = checks.some(
          (check) =>
            check.resource.type !== 'database.collection' &&
            check.decision.effect === 'deny',
        );
        return {
          effect: denied
            ? 'deny'
            : checks.some((check) => check.decision.effect !== 'permit')
              ? 'conditional'
              : 'permit',
          conditions,
          reasons: [
            ...decision.reasons,
            ...checks.flatMap((check) => check.decision.reasons),
          ],
        };
      };
      const unrestricted = await grants.unrestricted?.({
        principal: request.principal,
        ...(request.subjects === undefined
          ? {}
          : { subjects: request.subjects }),
      });
      if (unrestricted === true) {
        return await finish(
          handler.authorizeUnrestricted
            ? await handler.authorizeUnrestricted(request)
            : {
                effect: 'permit',
                reasons: [
                  {
                    code: 'UNRESTRICTED_ACCESS',
                    message: `Unrestricted access allows ${request.resource.type}.${request.action}`,
                    plugin: handler.resourceType,
                  },
                ],
              },
        );
      }
      const decision = await handler.authorize(request, {
        grants,
        constraints,
      });
      if (
        decision.effect === 'conditional' &&
        decision.conditions === undefined
      ) {
        return this.deny(
          'INVALID_CONDITIONAL_DECISION',
          `Handler "${handler.resourceType}" returned a conditional decision without conditions`,
        );
      }
      return await finish(decision);
    } catch (error) {
      return this.deny(
        'AUTHORIZATION_HANDLER_FAILED',
        error instanceof Error ? error.message : 'Authorization handler failed',
      );
    }
  }

  for(identity: AuthorizationIdentity): AuthorizationScope {
    const grants = this.grants.scope?.(identity) ?? this.grants;
    const constraints = this.constraints.scope(identity);
    const request = <TParams>(
      input: Omit<AuthorizationRequest<TParams>, 'principal' | 'subjects'>,
    ): AuthorizationRequest<TParams> =>
      ({
        ...input,
        principal: identity.principal,
        ...(identity.subjects === undefined
          ? {}
          : { subjects: identity.subjects }),
      }) as AuthorizationRequest<TParams>;
    const authorize = <TParams>(
      input: Omit<AuthorizationRequest<TParams>, 'principal' | 'subjects'>,
    ): Promise<AuthorizationDecision> =>
      this.authorizeWithGrants(request(input), grants, constraints);
    return {
      identity,
      authorize: authorize as AuthorizationScope['authorize'],
      can: async (input) =>
        (
          await this.authorizeWithGrants(
            request(input),
            grants,
            constraints,
            false,
          )
        ).effect === 'permit',
      require: async (input) => {
        const decision = await authorize(input);
        if (decision.effect !== 'permit') {
          throw new AuthorizationDeniedError(decision);
        }
      },
      explain: authorize,
      permissions: () => this.resolvePermissions(identity, grants),
    };
  }

  middleware(): MiddlewareHandler<AuthorizationEnv> {
    return async (http, next) => {
      const request = createAuthorizationMiddlewareRequest(http);
      await runAuthorizationMiddlewares(this.middlewares, request, async () => {
        if (!request.principal) {
          throw new Error('Authorization principal was not resolved');
        }
        http.set(
          'authz',
          this.for({
            principal: request.principal,
            subjects: request.subjects.values(),
          }),
        );
        await next();
      });
    };
  }

  guard<TParams = undefined, TVariables extends object = object>(
    resolve: AuthorizationGuardResolver<TParams, TVariables>,
  ): MiddlewareHandler<AuthorizationGuardEnv<TVariables>> {
    return async (http, next) => {
      const variables: Partial<AuthorizationEnv['Variables']> = http.var;
      const authz = variables.authz;
      if (!authz) {
        throw new Error(
          'Authorization guard requires authorization.middleware() to run first',
        );
      }
      const request: AuthorizationGuardRequest<TParams> = await resolve(http);
      await authz.require<TParams>(request);
      await next();
    };
  }

  async can<TParams = undefined>(
    request: AuthorizationRequest<TParams>,
  ): Promise<boolean> {
    return (
      (
        await this.authorizeWithGrants(
          request,
          this.grants,
          this.constraints,
          false,
        )
      ).effect === 'permit'
    );
  }

  async require<TParams = undefined>(
    request: AuthorizationRequest<TParams>,
  ): Promise<void> {
    const decision = await this.authorize(request);
    if (decision.effect !== 'permit') {
      throw new AuthorizationDeniedError(decision);
    }
  }

  explain<TParams = undefined>(
    request: AuthorizationRequest<TParams>,
  ): Promise<AuthorizationDecision> {
    return this.authorize(request);
  }

  describe(): AuthorizationDescription {
    return {
      plugins: this.plugins.map((plugin) => plugin.id),
      ...(this.grantProvider === undefined
        ? {}
        : { grantProvider: this.grantProvider }),
      resourceTypes: this.resourceTypes
        .list()
        .filter(
          (type) =>
            type !== 'resource' || this.resources.definitionsList().length > 0,
        ),
      constraintResolvers: this.constraints.list(),
    };
  }

  private createMissingGrantService(): AuthorizationGrantService {
    return {
      resolve(): Promise<never> {
        return Promise.reject(new Error('Authorization has no Grant Provider'));
      },
      resolveAll(): Promise<never> {
        return Promise.reject(new Error('Authorization has no Grant Provider'));
      },
    };
  }

  private async resolvePermissions(
    identity: AuthorizationIdentity,
    grantsService: AuthorizationGrantService = this.grants,
  ): Promise<AuthorizationPermissionsSnapshot> {
    const unrestricted =
      (await grantsService.unrestricted?.(identity)) === true;
    const grants = await grantsService.resolveAll(identity);
    const grouped = new Map<
      string,
      { resource: AuthorizationPermission['resource']; actions: Set<string> }
    >();
    for (const grant of grants) {
      if (grant.policy !== undefined) {
        if (
          !this.resourceTypes.getAction(
            grant.resource.type,
            grant.resource.id,
            grant.action,
          )?.scope
        )
          continue;
        const decision = await this.authorizeWithGrants<undefined>(
          { ...identity, resource: grant.resource, action: grant.action },
          grantsService,
          this.constraints,
          false,
        );
        if (decision.effect !== 'permit') continue;
      }
      const key = `${grant.resource.type}\u0000${grant.resource.id}`;
      const permission = grouped.get(key) ?? {
        resource: grant.resource,
        actions: new Set<string>(),
      };
      permission.actions.add(grant.action);
      grouped.set(key, permission);
    }
    return {
      unrestricted,
      permissions: [...grouped.values()]
        .sort((left, right) => {
          const leftKey = `${left.resource.type}\u0000${left.resource.id}`;
          const rightKey = `${right.resource.type}\u0000${right.resource.id}`;
          return leftKey.localeCompare(rightKey);
        })
        .map((permission) => ({
          resource: permission.resource,
          actions: [...permission.actions].sort(),
        })),
    };
  }

  private installApis(): void {
    const target = this as Authorization & Record<string, unknown>;
    for (const plugin of this.plugins) {
      for (const [name, api] of Object.entries(plugin.authorizationApi ?? {})) {
        if (name in target) {
          throw new Error(
            `Authorization API already registered: ${name} (plugin: ${plugin.id})`,
          );
        }
        Object.defineProperty(target, name, {
          configurable: false,
          enumerable: true,
          writable: false,
          value: api,
        });
      }
    }
  }

  private deny(code: string, message: string): AuthorizationDecision {
    const reason: AuthorizationReason = { code, message };
    return { effect: 'deny', reasons: [reason] };
  }
}

export function createAuthorization<
  const TPlugins extends readonly AuthorizationPlugin[],
  TConnection = unknown,
>(
  options: CreateAuthorizationOptions<TPlugins, TConnection>,
): Authorization & AuthorizationPluginApis<TPlugins> {
  return new Authorization(options) as Authorization &
    AuthorizationPluginApis<TPlugins>;
}
