import type { Auth } from '@nocobase/app-plugin-authentication';
import {
  AuthorizationDeniedError,
  type AuthorizationEnv,
} from '@nocobase/authorization/core';
import { Hono, type Context } from 'hono';
import type { AppAuthorization } from '../authorization.js';

/**
 * `/permissions` for the signed-in user; every other path goes to whichever
 * plugin registered it with `authz.routes.add`.
 */
export function createAuthorizationRoutes(
  auth: Auth,
  authorization: AppAuthorization,
): Hono<AuthorizationEnv> {
  const routes = new Hono<AuthorizationEnv>();
  routes.onError((error, context) => {
    if (error instanceof AuthorizationDeniedError)
      return context.json({ code: 'FORBIDDEN', message: error.message }, 403);
    throw error;
  });
  routes.use('*', auth.required());
  routes.use('*', authorization.middleware());
  routes.get('/permissions', async (context) =>
    context.json({ data: await context.get('authz').snapshot() }),
  );
  routes.all('*', async (context, next) => {
    const response = authorization.routes.handle({
      request: context.req.raw,
      path: mountedPath(context),
      authorization: context.get('authz'),
    });
    if (response) return await response;
    await next();
  });
  return routes;
}

/** The request path with the mount removed. */
function mountedPath(context: Context<AuthorizationEnv>): string {
  const wildcard = context.req.routePath.indexOf('*');
  const mount =
    wildcard === -1
      ? ''
      : context.req.routePath.slice(0, wildcard).replace(/\/$/, '');
  return context.req.path.slice(mount.length) || '/';
}
