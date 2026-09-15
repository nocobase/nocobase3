import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
  type RepositoryAuthorizationExposure,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  defineRepositoryApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  databaseManagerToken,
  RepositoryError,
  type RepositoryPolicy,
} from '@nocobase/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { COLLECTION } from '../collection.js';

/**
 * The shape this example offers. What a caller gets is this narrowed by their
 * grants, so the owner scope comes from the Permission Set rather than here.
 *
 * `read` is written as a node rather than `true` because the grant patch that
 * narrows it carries no relations, and a `true` member is replaced wholesale.
 */
const shape: RepositoryPolicy = {
  read: {
    scope: true,
    fields: ['id', 'title', 'status', 'ownerId', 'createdAt', 'updatedAt'],
    relations: {},
  },
  update: { scope: true, fields: ['title', 'status', 'updatedAt'] },
  delete: true,
  // Creating goes through the route below, which stamps the owner itself.
  create: false,
};

const repositories: readonly RepositoryAuthorizationExposure[] = [
  {
    name: COLLECTION,
    resource: COLLECTION,
    policy: shape,
    actions: {
      findMany: { maxLimit: 100 },
      findOne: {},
      count: {},
      updateOne: {},
      deleteOne: {},
    },
  },
];

/** Scene one: the generated Repository API, authorized endpoint by endpoint. */
export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(async (app) => {
    const router = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const authorize = authorization.db.repositories(repositories);
    // Guard each path by name; a wildcard would reach contributions mounted
    // alongside this one.
    for (const { name, actions } of repositories)
      for (const action of Object.keys(actions))
        router.use(`/${name}:${action}`, authentication.required(), authorize);
    router.route(
      '/',
      await defineRepositoryApiRoutes({
        principal: authorize.principal,
        repositories: authorize.repositories,
      }).createRouter(app),
    );
    return router;
  });

/**
 * Scene two: a hand-written create.
 *
 * The generated endpoint takes its values from the body, so a caller could
 * choose their own `ownerId` and write a row they would then be the owner of.
 * This route stamps it from the principal instead and binds the same Policy,
 * so the grant still decides whether the write is allowed at all.
 */
export const createRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const repository = app.container
      .resolve(databaseManagerToken)
      .repository(COLLECTION);
    routes.use(
      '*',
      authentication.required(),
      authorization.middleware(),
      bodyLimit({ maxSize: 16 * 1024 }),
    );
    routes.post('/tasks', async (c) => {
      const body: unknown = await c.req.json().catch(() => undefined);
      const title = parseTitle(body);
      if (title === undefined) return c.json({ code: 'INVALID_TITLE' }, 400);
      const policy = await authorization.db.policyFor(COLLECTION, c.var.authz);
      const now = new Date();
      try {
        const { record } = await repository.withPolicy(policy).createOne({
          values: {
            title,
            status: 'open',
            ownerId: c.var.authz.identity.principal.id,
            createdAt: now,
            updatedAt: now,
          },
        });
        return c.json({ data: { id: record.id } }, 201);
      } catch (error) {
        if (error instanceof RepositoryError && forbidden.has(error.code))
          return c.json({ code: error.code, message: error.message }, 403);
        throw error;
      }
    });
    return router.route('/authorization-example', routes);
  });

/** What a refused grant raises here, mapped as `app-server` maps it. */
const forbidden: ReadonlySet<string> = new Set([
  'WRITE_FORBIDDEN',
  'FIELD_WRITE_FORBIDDEN',
]);

/** A title only: the owner is the server's to decide, never the body's. */
function parseTitle(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'title')) return undefined;
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  return title && title.length <= 255 ? title : undefined;
}

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
  createRoutes,
];
export default routes;
