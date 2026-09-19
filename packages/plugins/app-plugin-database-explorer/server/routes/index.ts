import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { loggingToken } from '@nocobase/app-server/logging';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';

import {
  listCollections,
  listConnections,
  readCollection,
  readPhysicalCollection,
  MAX_COLLECTION_PAGE_SIZE,
  type ExplorerDatabaseConfig,
} from '../explorer.js';
import { isSchemaInspectorError } from '../errors.js';
import { DatabaseExplorerError } from '../types.js';

/**
 * The page this plugin owns. The Client Route declares the same resource, so a
 * single `page:database-explorer/access` grant governs both the navigation
 * entry and a direct call to these endpoints.
 */
export const DATABASE_EXPLORER_PAGE: string = 'database-explorer';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes((app) => {
    const { container } = app;
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const logger = container.has(loggingToken)
      ? container.resolve(loggingToken).getLogger('database-explorer')
      : undefined;

    routes.onError((error, context) => {
      if (!(error instanceof DatabaseExplorerError)) throw error;
      if (error.status === 502) {
        // Only the classification is recorded. A driver's connection error
        // quotes the host, database, and account it failed to reach, so
        // writing the cause here would put into the log file exactly what the
        // response body goes to such lengths to withhold -- and a log is the
        // easier of the two to copy into an issue.
        logger?.warn(
          {
            event: 'connection.unreadable',
            code: error.code,
            cause: classifyCause(error.cause),
          },
          'A connection could not be read.',
        );
      }
      return context.json(
        { code: error.code, message: error.message },
        error.status,
      );
    });

    routes.use('*', authentication.required(), authorization.middleware());

    routes.use('*', async (context, next) => {
      const allowed = await context.get('authz').can({
        resource: { type: 'page', id: DATABASE_EXPLORER_PAGE },
        action: 'access',
      });
      if (!allowed) {
        return context.json(
          {
            code: 'DATABASE_EXPLORER_FORBIDDEN',
            message: 'Database Explorer access is required.',
          },
          403,
        );
      }
      await next();
    });

    routes.use('*', async (context, next) => {
      // `database.default: none` leaves the Manager unregistered while the
      // configuration may still list connections. Reporting those would offer
      // a list of databases that cannot be opened.
      if (!container.has(databaseManagerToken)) {
        return context.json(
          {
            code: 'DATABASE_UNAVAILABLE',
            message: 'This application is configured without a database.',
          },
          503,
        );
      }
      await next();
    });

    // Connections are read from configuration rather than from the Manager, so
    // rendering the first screen opens no databases.
    const config = (): ExplorerDatabaseConfig | undefined =>
      app.config.get<ExplorerDatabaseConfig>('database');
    const manager = () => container.resolve(databaseManagerToken);

    routes.get('/connections', (context) =>
      context.json({ data: listConnections(config()) }),
    );

    routes.get('/connections/:connection/collections', async (context) => {
      const data = await listCollections(
        manager(),
        config(),
        context.req.param('connection'),
        {
          ...optionalLimit(context.req.query('limit')),
          ...optionalCursor(context.req.query('cursor')),
        },
      );
      return context.json({ data });
    });

    routes.get(
      '/connections/:connection/collections/:collection',
      async (context) => {
        const data = await readCollection(
          manager(),
          config(),
          context.req.param('connection'),
          context.req.param('collection'),
        );
        return context.json({ data });
      },
    );

    routes.get(
      '/connections/:connection/collections/:collection/physical',
      async (context) => {
        const data = await readPhysicalCollection(
          manager(),
          config(),
          context.req.param('connection'),
          context.req.param('collection'),
        );
        return context.json({ data });
      },
    );

    router.route('/database-explorer', routes);
    return router;
  });

/**
 * Names the kind of failure underneath without quoting it. An inspector error
 * carries a stable code; anything else is identified by its constructor name,
 * which no driver puts a credential in.
 */
function classifyCause(cause: unknown): string {
  if (isSchemaInspectorError(cause)) return cause.code;
  return cause instanceof Error ? cause.name : typeof cause;
}

function optionalLimit(value: string | undefined): { limit?: number } {
  if (value === undefined) return {};
  const limit = Number(value);
  if (
    !Number.isInteger(limit) ||
    limit <= 0 ||
    limit > MAX_COLLECTION_PAGE_SIZE
  ) {
    throw new DatabaseExplorerError(
      'INVALID_LIST_OPTIONS',
      400,
      `The limit must be an integer between 1 and ${MAX_COLLECTION_PAGE_SIZE}.`,
    );
  }
  return { limit };
}

function optionalCursor(value: string | undefined): { cursor?: string } {
  if (value === undefined) return {};
  if (value.length === 0) {
    throw new DatabaseExplorerError(
      'INVALID_CURSOR',
      400,
      'The cursor must not be empty.',
    );
  }
  return { cursor: value };
}

const routes: readonly AppRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
