import type { DatabaseConnection } from '@nocobase/db';
import { ResourceHandlerRegistry } from './registry.js';
import { AccessConstraintRegistry } from './constraints.js';
import type { AccessConstraintService } from './constraints.js';
import {
  sortAuthorizationPlugins,
  type AuthorizationPluginApis,
  type AuthorizationPlugin,
} from './plugin.js';
import type { AuthorizationGrantService } from './grants.js';
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
  authorize<TParams = undefined>(
    request: Omit<AuthorizationRequest<TParams>, 'principal' | 'subjects'>,
  ): Promise<AuthorizationDecision>;
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
> {
  connection?: DatabaseConnection;
  plugins: TPlugins;
}

interface AuthorizationOptions {
  connection?: DatabaseConnection;
  plugins: readonly AuthorizationPlugin[];
}

export class Authorization {
  private readonly plugins: readonly AuthorizationPlugin[];
  readonly resources: ResourceHandlerRegistry;
  readonly constraints: AccessConstraintRegistry;
  readonly permissions: AuthorizationPermissionsApi;
  private readonly grants: AuthorizationGrantService;
  private readonly grantProvider?: string;
  private readonly middlewares: AuthorizationMiddleware[] = [];

  constructor(options: AuthorizationOptions) {
    this.resources = new ResourceHandlerRegistry();
    this.constraints = new AccessConstraintRegistry();
    this.permissions = createAuthorizationPermissionsApi();
    this.plugins = sortAuthorizationPlugins(options.plugins);
    const grantProvider = this.plugins.find((plugin) => plugin.grants);
    this.grants = grantProvider?.grants ?? this.createMissingGrantService();
    this.grantProvider = grantProvider?.id;
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
        constraints: this.constraints,
        use: (middleware): void => {
          this.middlewares.push(middleware);
        },
      });
    }
  }

  async authorize<TParams = undefined>(
    request: AuthorizationRequest<TParams>,
  ): Promise<AuthorizationDecision> {
    return this.authorizeWithGrants(request, this.grants);
  }

  private async authorizeWithGrants<TParams>(
    request: AuthorizationRequest<TParams>,
    grants: AuthorizationGrantService,
    constraints: AccessConstraintService = this.constraints,
  ): Promise<AuthorizationDecision> {
    const handler = this.resources.get(request.resource.type);
    if (!handler) {
      return this.deny(
        'UNKNOWN_RESOURCE_TYPE',
        `No authorization handler accepts resource type "${request.resource.type}"`,
      );
    }
    try {
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
      return decision;
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
      authorize,
      can: async (input) => (await authorize(input)).effect === 'permit',
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
    return (await this.authorize(request)).effect === 'permit';
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
      resourceTypes: this.resources.list(),
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
    const grants = await grantsService.resolveAll(identity);
    const grouped = new Map<
      string,
      { resource: AuthorizationPermission['resource']; actions: Set<string> }
    >();
    for (const grant of grants) {
      if (grant.policy !== undefined) continue;
      const key = `${grant.resource.type}\u0000${grant.resource.id}`;
      const permission = grouped.get(key) ?? {
        resource: grant.resource,
        actions: new Set<string>(),
      };
      permission.actions.add(grant.action);
      grouped.set(key, permission);
    }
    return {
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
>(
  options: CreateAuthorizationOptions<TPlugins>,
): Authorization & AuthorizationPluginApis<TPlugins> {
  return new Authorization(options) as Authorization &
    AuthorizationPluginApis<TPlugins>;
}
