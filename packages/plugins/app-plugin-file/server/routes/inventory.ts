import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context, type Env, type Input } from 'hono';

import type {
  FileInventoryErrorResponse,
  FileInventorySourcesResponse,
} from '../../shared/inventory.js';
import { listDatabaseFileSourceItems } from '../file-inventory-query.js';
import {
  findRegisteredDatabaseFileSource,
  listRegisteredDatabaseFileSources,
} from '../file-source-registry.js';
import { translateFileMessage } from '../i18n.js';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export const inventoryApiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes((app) => {
    const authentication = app.container.resolve(authenticationToken);
    const database = app.container.has(databaseManagerToken)
      ? app.container.resolve(databaseManagerToken)
      : undefined;
    const router = new Hono();
    const routes = new Hono();

    routes.use('*', authentication.required());

    routes.get('/sources', async (context) => {
      if (!database) {
        const response: FileInventorySourcesResponse = { data: [] };
        return context.json(response);
      }
      const response: FileInventorySourcesResponse = {
        data: listRegisteredDatabaseFileSources(database),
      };
      return context.json(response);
    });

    routes.get('/sources/:sourceId/files', async (context) => {
      if (!database) {
        return inventoryError(
          context,
          'FILE_SOURCE_NOT_FOUND',
          'errors.inventorySourceNotFound',
          'The registered file source was not found.',
          404,
        );
      }
      const source = findRegisteredDatabaseFileSource(
        database,
        context.req.param('sourceId'),
      );
      if (!source) {
        return inventoryError(
          context,
          'FILE_SOURCE_NOT_FOUND',
          'errors.inventorySourceNotFound',
          'The registered file source was not found.',
          404,
        );
      }
      const page = parsePositiveInteger(context.req.query('page'), 1);
      const pageSize = parsePositiveInteger(
        context.req.query('pageSize'),
        DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      );
      if (
        page === null ||
        pageSize === null ||
        !Number.isSafeInteger((page - 1) * pageSize)
      ) {
        return inventoryError(
          context,
          'INVALID_FILE_INVENTORY_PAGINATION',
          'errors.inventoryPaginationInvalid',
          'File inventory pagination is invalid.',
          400,
        );
      }
      try {
        return context.json(
          await listDatabaseFileSourceItems(database, source, {
            page,
            pageSize,
          }),
        );
      } catch (error) {
        console.error('File inventory source listing failed.', {
          table: source.table,
          error,
        });
        return inventoryError(
          context,
          'FILE_SOURCE_UNAVAILABLE',
          'errors.inventorySourceUnavailable',
          'The registered file table is unavailable.',
          503,
        );
      }
    });

    router.route('/files/inventory', routes);
    return router;
  });

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

function inventoryError<
  TEnv extends Env,
  TPath extends string,
  TInput extends Input,
>(
  context: Context<TEnv, TPath, TInput>,
  code: string,
  key: string,
  defaultValue: string,
  status: 400 | 404 | 503,
): Response {
  const response: FileInventoryErrorResponse = {
    error: {
      code,
      message: translateFileMessage(context, key, defaultValue),
    },
  };
  return context.json(response, status);
}
