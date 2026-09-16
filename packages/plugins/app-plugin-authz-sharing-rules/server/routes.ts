import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { Hono } from 'hono';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { databaseManagerToken } from '@nocobase/db';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import {
  AuthorizationDeniedError,
  type AuthorizationEnv,
} from '@nocobase/authorization/core';
import type { SharingRulesAuthorizationApi } from '@nocobase/authorization/sharing-rules';
import {
  createRuleOptionsRoutes,
  createAuthorizationAdministration,
  describeCollection,
} from '@nocobase/app-plugin-authorization/server/management';
import { createSharingRulesHandler } from './handler.js';

const contributions: readonly AppApiRouteContribution<AppPluginApplication>[] =
  [
    defineApiRoutes<AppPluginApplication>(({ container }) => {
      const router = new Hono();
      const authorization = container.resolve(authorizationToken);
      if (!('sharingRules' in authorization)) return router;
      const api = (
        authorization as typeof authorization & SharingRulesAuthorizationApi
      ).sharingRules;
      const connection = container.has(databaseManagerToken)
        ? container.resolve(databaseManagerToken).connection()
        : undefined;
      const routes = new Hono<AuthorizationEnv>();
      routes.onError((error, context) => {
        if (error instanceof AuthorizationDeniedError)
          return context.json(
            { code: 'FORBIDDEN', message: error.message },
            403,
          );
        throw error;
      });
      routes.use(
        '/sharing-rules/*',
        container.resolve(authenticationToken).required(),
      );
      routes.use('/sharing-rules/*', authorization.middleware());
      const administration = createAuthorizationAdministration({
        connection,
        resolveCollection: async (name) =>
          connection &&
          authorization.getResource('database.collection').items.has(name)
            ? describeCollection(connection, name)
            : undefined,
      });
      routes.route(
        '/',
        createRuleOptionsRoutes(
          authorization,
          administration,
          connection,
          'sharing-rules',
        ),
      );
      const handler = createSharingRulesHandler(api);
      routes.all('/sharing-rules', (context) =>
        handler({
          request: context.req.raw,
          path: '/sharing-rules',
          authorization: context.get('authz'),
        }),
      );
      routes.all('/sharing-rules/*', (context) =>
        handler({
          request: context.req.raw,
          path: context.req.path.slice(
            context.req.routePath.lastIndexOf('/sharing-rules'),
          ),
          authorization: context.get('authz'),
        }),
      );
      router.route('/authz', routes);
      return router;
    }),
  ];

export default contributions;
