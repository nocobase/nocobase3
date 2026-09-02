import { Hono } from 'hono';
import {
  createPlaygroundDatabase,
  type CreatePlaygroundDatabaseOptions,
  type PlaygroundDatabase,
} from './database/index.js';
import { errorCode, PlaygroundHttpError } from './server/errors.js';
import { createContactRoutes } from './server/routes/contacts.js';
import { createCustomerRoutes } from './server/routes/customers.js';
import { createDashboardRoutes } from './server/routes/dashboard.js';
import { createDatabaseRoutes } from './server/routes/database.js';
import { createOrderRoutes } from './server/routes/orders.js';
import { createProductRoutes } from './server/routes/products.js';
import { OrderService } from './server/services/orders.js';

export interface DatabasePlayground {
  readonly app: Hono;
  readonly database: PlaygroundDatabase;
  close(): Promise<void>;
}

export async function createDatabasePlayground(
  options: CreatePlaygroundDatabaseOptions = {},
): Promise<DatabasePlayground> {
  const database = await createPlaygroundDatabase(options);
  const app = new Hono();
  const orderService = new OrderService(database.main, database.crm);

  app.get('/api/health', (context) =>
    context.json({
      data: {
        status: 'ok',
        connections: ['main', 'crm'],
        databasePaths: database.paths,
      },
    }),
  );
  app.route(
    '/api/dashboard',
    createDashboardRoutes(database.main, database.crm),
  );
  app.route('/api/products', createProductRoutes(database.main));
  app.route('/api/orders', createOrderRoutes(orderService));
  app.route('/api/crm/customers', createCustomerRoutes(database.crm));
  app.route('/api/crm/contacts', createContactRoutes(database.crm));
  app.route(
    '/api/database',
    createDatabaseRoutes({
      main: {
        connection: database.main,
        databasePath: database.paths.main,
        metadataStore: 'DatabaseCollectionMetadataStore',
        physicalTablePrefix: 'shop_',
      },
      crm: {
        connection: database.crm,
        databasePath: database.paths.crm,
        metadataStore: 'ModuleCollectionMetadataStore',
        physicalTablePrefix: 'crm_',
      },
    }),
  );

  app.notFound((context) =>
    context.json(
      { error: { code: 'NOT_FOUND', message: 'Route not found.' } },
      404,
    ),
  );
  app.onError((error, context) => {
    if (error instanceof PlaygroundHttpError) {
      return context.json(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    }
    const code = errorCode(error);
    const status = isConflictError(error) ? 409 : 500;
    return context.json(
      {
        error: {
          code: code ?? 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      status,
    );
  });

  return { app, database, close: () => database.close() };
}

function isConflictError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique|constraint/i.test(message);
}
