import type {
  Authorization,
  AuthorizationEnv,
  AuthorizationActions,
  AuthorizationResourceReference,
} from '@nocobase/authorization/core';
import {
  addRepositoryRequestConstraint,
  type RepositoryApiAction,
} from '@nocobase/app-server/router';
import type { MiddlewareHandler } from 'hono';

export interface AuthorizeRepositoryOptions<A extends AuthorizationActions> {
  readonly repository: string;
  readonly resource: AuthorizationResourceReference<A>;
  readonly actions: Partial<
    Record<RepositoryApiAction, NoInfer<keyof A & string>>
  >;
}

const operations: Readonly<Record<RepositoryApiAction, string>> = {
  findMany: 'read',
  findOne: 'read',
  count: 'read',
  exists: 'read',
  aggregate: 'read',
  groupBy: 'read',
  createOne: 'create',
  updateOne: 'update',
  deleteOne: 'delete',
};

export function createBusinessRepositoryAuthorization<
  A extends AuthorizationActions,
>(
  authz: Authorization,
  options: AuthorizeRepositoryOptions<A>,
): MiddlewareHandler<AuthorizationEnv> {
  if (!options.repository || options.repository.includes('*'))
    throw new TypeError(
      'Repository name must be non-empty and contain no wildcard',
    );

  const repository = options.repository;
  const resource = options.resource.name;
  const bindings = new Map<string, { action: string; collection: string }>();

  for (const [method, action] of Object.entries(options.actions)) {
    if (!Object.hasOwn(operations, method) || typeof action !== 'string')
      throw new TypeError('Invalid Repository action binding');

    const definition = authz.resources.operation(resource, action);
    const scopes = Object.values(definition?.scopes ?? {});
    const collection = scopes[0]?.resource.id;
    if (
      !definition ||
      scopes.length !== 1 ||
      !collection ||
      scopes[0].resource.type !== 'database.collection' ||
      definition.grants.some(
        (grant) =>
          grant.resource.type !== 'database.collection' ||
          grant.resource.id !== collection,
      ) ||
      !definition.grants.some((grant) =>
        grant.actions.some(
          (entry) => entry.action === operations[method as RepositoryApiAction],
        ),
      )
    ) {
      throw new TypeError(
        `Repository ${repository}:${method} requires a single-collection, single-scope business action with the matching database operation`,
      );
    }
    bindings.set(method, { action, collection });
  }

  const identity = authz.middleware();
  return async (context, next) => {
    const segment = context.req.path.slice(
      context.req.path.lastIndexOf('/') + 1,
    );
    const colon = segment.lastIndexOf(':');
    if (colon < 0 || decodeURIComponent(segment.slice(0, colon)) !== repository)
      return next();

    const method = segment.slice(colon + 1);
    const binding = bindings.get(method);
    if (!binding) return context.json({ code: 'FORBIDDEN' }, 403);

    const authorize = async (): Promise<void> => {
      const decision = await context.var.authz.authorize({
        resource: { type: 'resource', id: resource },
        action: binding.action,
      });
      const policies = decision.conditions?.database;
      if (
        decision.effect === 'deny' ||
        !policies ||
        Object.keys(policies).length !== 1 ||
        !policies[binding.collection]
      ) {
        context.res = context.json({ code: 'FORBIDDEN' }, 403);
        return;
      }

      addRepositoryRequestConstraint(context, {
        repository,
        action: method as RepositoryApiAction,
        collection: binding.collection,
        policy: policies[binding.collection],
      });
      await next();
    };

    if (context.var.authz) return authorize();
    return identity(context, authorize);
  };
}
