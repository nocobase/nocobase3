import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { databaseManagerToken } from '@nocobase/db';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { createAuthorizationRoutes } from './authorization.js';
import { createAuthorizationAdministration } from '../administration.js';
import { appAuthorizationDatabase } from '../authorization.js';
import { authorizationToken } from '../tokens.js';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    const authorization = container.resolve(authorizationToken);
    const database = container.has(databaseManagerToken)
      ? container.resolve(databaseManagerToken)
      : undefined;
    router.route(
      '/authz',
      createAuthorizationRoutes(
        container.resolve(authenticationToken),
        authorization,
        createAuthorizationAdministration({
          ...(database === undefined
            ? {}
            : { connection: database.connection() }),
          resolveCollection: (name) =>
            appAuthorizationDatabase(authorization)?.collections.get(name),
        }),
      ),
    );
    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
