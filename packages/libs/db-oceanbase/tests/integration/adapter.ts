import { createDatabaseManager } from '@nocobase/db';
import {
  createDatabaseIntegrationAdapter,
  dropPortableIntegrationObjects,
  type DatabaseIntegrationAdapter,
} from '@nocobase/db-testkit';
import oceanbase from '../../src/index.js';

export const oceanbaseIntegrationAdapter: DatabaseIntegrationAdapter =
  createDatabaseIntegrationAdapter({
    name: 'oceanbase',
    createDatabase: (prefix, metadataStore) =>
      createDatabaseManager({
        default: 'main',
        metadataStore,
        connections: {
          main: oceanbase({
            host: process.env.OCEANBASE_HOST ?? '127.0.0.1',
            port: Number(process.env.OCEANBASE_PORT ?? 12881),
            username: process.env.OCEANBASE_USER ?? 'root@test',
            password: process.env.OCEANBASE_PASSWORD ?? 'ObTest_123456',
            database:
              process.env.OCEANBASE_DATABASE ?? 'nocobase_collection_builder',
            naming: { tablePrefix: `${prefix}_` },
          }),
        },
      }),
    cleanup: async (context) => {
      await context.db.raw('set foreign_key_checks = 0');
      try {
        await dropPortableIntegrationObjects(context, [
          'orderItems',
          'dryRunItems',
          'viewSource',
          'viewRows',
          'keyless',
        ]);
      } finally {
        await context.db.raw('set foreign_key_checks = 1');
      }
    },
  });
