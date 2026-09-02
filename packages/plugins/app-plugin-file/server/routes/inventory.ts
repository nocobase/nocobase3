import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';

import {
  FILE_INVENTORY_RESOURCE,
  type FileInventorySourcesResponse,
} from '../../shared/inventory.js';
import {
  fileSourceUnavailableMessage,
  listDatabaseFileSourceItems,
  summarizeDatabaseFileSource,
} from '../file-inventory-query.js';
import {
  findRegisteredDatabaseFileSource,
  listRegisteredDatabaseFileSources,
} from '../file-source-registry.js';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export const inventoryApiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes((app) => {
    const router = new Hono();
    if (!hasInventoryDependencies(app)) return router;

    const database = app.container.resolve(databaseManagerToken);
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const routes = new Hono<AuthorizationEnv>();

    routes.use('*', authentication.required(), authorization.middleware());
    routes.use('*', async (context, next) => {
      const allowed = await context.get('authz').can({
        resource: { type: 'page', id: FILE_INVENTORY_RESOURCE },
        action: 'access',
      });
      if (!allowed) {
        return context.json(
          { code: 'FORBIDDEN', message: 'File inventory access is required.' },
          403,
        );
      }
      await next();
    });

    routes.get('/sources', async (context) => {
      const sources = listRegisteredDatabaseFileSources(
        database,
        app.publicBasePath,
      );
      const data = await Promise.all(
        sources.map((source) => summarizeDatabaseFileSource(database, source)),
      );
      const response: FileInventorySourcesResponse = { data };
      return context.json(response);
    });

    routes.get('/sources/:sourceId/files', async (context) => {
      const source = findRegisteredDatabaseFileSource(
        database,
        app.publicBasePath,
        context.req.param('sourceId'),
      );
      if (!source) {
        return context.json(
          {
            code: 'FILE_SOURCE_NOT_FOUND',
            message: 'The registered file source was not found.',
          },
          404,
        );
      }
      const page = parsePositiveInteger(context.req.query('page'), 1);
      const pageSize = parsePositiveInteger(
        context.req.query('pageSize'),
        DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      );
      if (page === null) return invalidPagination('page');
      if (pageSize === null) return invalidPagination('pageSize');
      try {
        return context.json(
          await listDatabaseFileSourceItems(database, source, {
            page,
            pageSize,
          }),
        );
      } catch {
        return context.json(
          {
            code: 'FILE_SOURCE_UNAVAILABLE',
            message: fileSourceUnavailableMessage(),
          },
          503,
        );
      }
    });

    router.route('/files/inventory', routes);
    return router;
  });

function hasInventoryDependencies(
  app: AppPluginApplication,
): app is AppPluginApplication & {
  readonly container: AppPluginApplication['container'];
} {
  return (
    app.container.has(databaseManagerToken) &&
    app.container.has(authenticationToken) &&
    app.container.has(authorizationToken)
  );
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number = Number.MAX_SAFE_INTEGER,
): number | null {
  if (value === undefined) return fallback;
  if (!/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    return null;
  }
  return parsed;
}

function invalidPagination(name: string): Response {
  return Response.json(
    {
      code: 'INVALID_FILE_INVENTORY_PAGINATION',
      message: `File inventory ${name} is invalid.`,
    },
    { status: 400 },
  );
}
