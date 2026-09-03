import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
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
import { Hono, type Context, type Env, type Input } from 'hono';

import type {
  FileInventoryErrorResponse,
  FileInventorySourcesResponse,
} from '../../shared/settings/inventory.js';
import { FILE_INVENTORY_RESOURCE } from '../../shared/settings/inventory.js';
import { translateFileMessage } from '../i18n.js';
import { listDatabaseFileSourceItems } from './inventory-query.js';
import {
  findRegisteredDatabaseFileSource,
  listRegisteredDatabaseFileSources,
} from './source-registry.js';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_CURSOR_LENGTH = 512;

type InventoryRoutesEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

export const fileSettingsApiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes((app) => {
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const database = app.container.has(databaseManagerToken)
      ? app.container.resolve(databaseManagerToken)
      : undefined;
    const router = new Hono();
    const routes = new Hono<InventoryRoutesEnv>();

    routes.use('*', authentication.required());
    routes.use('*', authorization.middleware());
    routes.use('*', async (context, next) => {
      const allowed = await context.get('authz').can({
        resource: { type: 'page', id: FILE_INVENTORY_RESOURCE },
        action: 'access',
      });
      if (!allowed) {
        return inventoryError(
          context,
          'FILE_INVENTORY_FORBIDDEN',
          'errors.inventoryForbidden',
          'File inventory access is required.',
          403,
        );
      }
      await next();
    });

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
      const pageSize = parsePositiveInteger(
        context.req.query('pageSize'),
        DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      );
      const cursorValue = context.req.query('cursor');
      const cursor = parseCursor(cursorValue);
      if (pageSize === null || cursor === null) {
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
            pageSize,
            ...(cursor === undefined ? {} : { cursor }),
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

function parseCursor(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value.length === 0 || value.length > MAX_CURSOR_LENGTH) return null;
  return value;
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
  status: 400 | 403 | 404 | 503,
): Response {
  const response: FileInventoryErrorResponse = {
    error: {
      code,
      message: translateFileMessage(context, key, defaultValue),
    },
  };
  return context.json(response, status);
}
