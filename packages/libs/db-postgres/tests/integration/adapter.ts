import { createDatabaseManager } from '@nocobase/db';
import {
  createDatabaseIntegrationAdapter,
  dropPortableIntegrationObjects,
  type DatabaseIntegrationAdapter,
} from '@nocobase/db-testkit';
import postgres from '../../src/index.js';

export const postgresIntegrationAdapter: DatabaseIntegrationAdapter =
  createDatabaseIntegrationAdapter({
    name: 'postgres',
    createDatabase: (prefix, metadataStore) =>
      createDatabaseManager({
        default: 'main',
        metadataStore,
        connections: {
          main: postgres({
            host:
              process.env.POSTGRES_HOST ?? process.env.PGHOST ?? '127.0.0.1',
            port: Number(
              process.env.POSTGRES_PORT ?? process.env.PGPORT ?? 15432,
            ),
            username:
              process.env.POSTGRES_USER ?? process.env.PGUSER ?? 'nocobase',
            password:
              process.env.POSTGRES_PASSWORD ??
              process.env.PGPASSWORD ??
              'nocobase',
            database:
              process.env.POSTGRES_DATABASE ??
              process.env.PGDATABASE ??
              'nocobase_collection_builder',
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
