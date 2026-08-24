import type { AppPluginRoutesContext } from '@nocobase/app-server/plugins';
import type { AuthorizationEnv } from '@nocobase/authorization/core';
import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';

import type { AppAuthorization } from '../authorization.js';

export interface AuthorizationPluginAuth {
  required(): MiddlewareHandler;
}

export interface AuthorizationPluginDeps {
  auth: AuthorizationPluginAuth;
  authz: AppAuthorization;
}

export type AuthorizationPluginRoutesContext = AppPluginRoutesContext<
  AuthorizationPluginDeps,
  unknown
>;

export default function registerAuthorizationRoutes({
  app,
  deps,
}: AuthorizationPluginRoutesContext): void {
  const routes = new Hono<AuthorizationEnv>();

  routes.use('*', deps.auth.required());
  routes.use('*', deps.authz.middleware());

  routes.get('/permissions', (context) =>
    deps.authz.permissions.handler({
      request: context.req.raw,
      authorization: context.get('authz'),
    }),
  );

  routes.on(
    ['GET', 'POST', 'PUT', 'DELETE'],
    ['/permission-sets', '/permission-sets/*'],
    (context) =>
      deps.authz.permissionSets.handler({
        request: context.req.raw,
        authorization: context.get('authz'),
        basePath: '/api/authz',
      }),
  );

  app.route('/api/authz', routes);
}
