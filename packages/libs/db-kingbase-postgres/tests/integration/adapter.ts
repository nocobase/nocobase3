import { createDatabaseManager } from '@nocobase/db';
import {
  createDatabaseIntegrationAdapter,
  dropPortableIntegrationObjects,
  type DatabaseIntegrationAdapter,
} from '@nocobase/db-testkit';
import kingbasePostgres from '../../src/index.js';

export const kingbasePostgresIntegrationAdapter: DatabaseIntegrationAdapter =
  createDatabaseIntegrationAdapter({
    name: 'kingbase-postgres',
    createDatabase: (prefix, metadataStore) =>
      createDatabaseManager({
        default: 'main',
        metadataStore,
        connections: {
          main: kingbasePostgres({
            host:
              process.env.KINGBASE_POSTGRES_HOST ??
              process.env.PGHOST ??
              '127.0.0.1',
            port: Number(
              process.env.KINGBASE_POSTGRES_PORT ?? process.env.PGPORT ?? 54321,
            ),
            username:
              process.env.KINGBASE_POSTGRES_USER ??
              process.env.PGUSER ??
              'nocobase',
            password:
              process.env.KINGBASE_POSTGRES_PASSWORD ??
              process.env.PGPASSWORD ??
              'nocobase',
            database:
              process.env.KINGBASE_POSTGRES_DATABASE ??
              process.env.PGDATABASE ??
              'test',
            naming: { tablePrefix: `${prefix}_` },
          }),
        },
      }),
    cleanup: async (context) => {
      await dropPortableIntegrationObjects(context, [
        'orderItems',
        'dryRunItems',
        'viewSource',
        'viewRows',
        'keyless',
      ]);
    },
  });
