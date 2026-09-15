import type {
  Authorization,
  AuthorizationEnv,
  AuthorizationScope,
} from '@nocobase/authorization/core';
import type { RepositoryApiExposure } from '@nocobase/app-server/router';
import {
  narrowRepositoryPolicy,
  normalizeRepositoryPolicy,
  type NormalizedRepositoryPolicy,
  type RepositoryPolicy,
} from '@nocobase/db';
import type { Context } from 'hono';

import type { DatabaseApi } from './database/api.js';

/** Where the middleware leaves what it decided for the request's exposure. */
const principalVariable = '@nocobase/app-plugin-authorization/repository';

/**
 * An exposure `defineRepositoryApiRoutes` accepts, plus the authorization
 * resource its rows belong to. A `database.collection` resource is named by the
 * collection alone — `'orders'` — exactly as `grant()` names it.
 */
export type RepositoryAuthorizationExposure = RepositoryApiExposure & {
  readonly resource?: string;
};

/** What the middleware resolved: the exposure it ran for, and its Policy. */
export interface RepositoryAuthorizationPrincipal {
  readonly exposure: string;
  readonly policy: NormalizedRepositoryPolicy;
}

/**
 * The middleware, carrying the two things `defineRepositoryApiRoutes` needs.
 * Mount it on every action of every exposure that names a `resource`: an
 * action it did not run on resolves no principal and is refused.
 */
export interface RepositoryAuthorization {
  (context: Context, next: () => Promise<void>): Promise<void>;
  readonly principal: (
    context: Context,
  ) => RepositoryAuthorizationPrincipal | undefined;
  readonly repositories: readonly RepositoryApiExposure<RepositoryAuthorizationPrincipal>[];
}

/** Every action refused. db then raises READ_FORBIDDEN or WRITE_FORBIDDEN. */
const denyAll: RepositoryPolicy = {
  read: false,
  create: false,
  update: false,
  delete: false,
};

interface GuardedExposure {
  readonly resource: string;
  readonly shape: NormalizedRepositoryPolicy;
}

export function createRepositoryAuthorization(
  authz: Authorization,
  database: DatabaseApi,
  exposures: readonly RepositoryAuthorizationExposure[],
): RepositoryAuthorization {
  const guarded = new Map<string, GuardedExposure>();
  const repositories = exposures.map(
    (exposure): RepositoryApiExposure<RepositoryAuthorizationPrincipal> => {
      if (!Object.hasOwn(exposure, 'resource')) return exposure;
      const { resource, ...rest } = exposure;
      if (resource === undefined) return rest;
      if (typeof exposure.policy === 'function') {
        throw new TypeError(
          `Repository exposure "${exposure.name}" names a resource and declares a policy function. Authorization narrows a static Policy; write the shape out.`,
        );
      }
      // Exposing a Collection's rows states it is part of the permission
      // model; a hand-registered one is already there and stays as it is.
      if (!database.collections.has(resource))
        database.collections.add({ name: resource });
      const name = exposure.name;
      guarded.set(name, {
        resource,
        shape: normalizeRepositoryPolicy(exposure.policy),
      });
      return {
        ...rest,
        // Falls through to a denial rather than to the shape: an action the
        // middleware never ran on must not read as permitted.
        policy: (principal) =>
          principal.exposure === name ? principal.policy : denyAll,
      };
    },
  );

  const identity = authz.middleware();
  const handler = async (
    context: Context,
    next: () => Promise<void>,
  ): Promise<void> => {
    const name = exposureName(context.req.path);
    const guard = name === undefined ? undefined : guarded.get(name);
    if (guard === undefined || name === undefined) return await next();
    const authorized = async (): Promise<void> => {
      const scope = context.get('authz') as AuthorizationScope;
      // The shape is what this exposure offers; the grant is the patch that
      // trims it. `policyFor` emits no relations, and an unmentioned member
      // stays as it was, so the shape keeps its relation rules.
      const policy = await database.policyFor(guard.resource, scope);
      context.set(principalVariable, {
        exposure: name,
        policy: narrowRepositoryPolicy(guard.shape, policy),
      });
      await next();
    };
    if (context.get('authz')) return await authorized();
    await identity(context as Context<AuthorizationEnv, string>, authorized);
  };

  return Object.assign(handler, {
    principal: (
      context: Context,
    ): RepositoryAuthorizationPrincipal | undefined =>
      context.get(principalVariable) as
        RepositoryAuthorizationPrincipal | undefined,
    repositories,
  });
}

/** A Repository endpoint is `/<name>:<action>`; the name may be encoded. */
function exposureName(path: string): string | undefined {
  const segment = path.slice(path.lastIndexOf('/') + 1);
  const colon = segment.lastIndexOf(':');
  if (colon <= 0) return undefined;
  return decodeURIComponent(segment.slice(0, colon));
}
