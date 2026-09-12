import { createDatabaseManager } from '@nocobase/db';
import {
  createDatabaseIntegrationAdapter,
  dropPortableIntegrationObjects,
  type DatabaseIntegrationAdapter,
} from '@nocobase/db-testkit';
import oceanbaseMysql from '../../src/index.js';

export const oceanbaseMysqlIntegrationAdapter: DatabaseIntegrationAdapter =
  createDatabaseIntegrationAdapter({
    name: 'oceanbase-mysql',
    createDatabase: (prefix, metadataStore) =>
      createDatabaseManager({
        default: 'main',
        metadataStore,
        connections: {
          main: oceanbaseMysql({
            host: process.env.OCEANBASE_MYSQL_HOST ?? '127.0.0.1',
            port: Number(process.env.OCEANBASE_MYSQL_PORT ?? 12881),
            username: process.env.OCEANBASE_MYSQL_USER ?? 'nocobase',
            password: process.env.OCEANBASE_MYSQL_PASSWORD ?? 'nocobase',
            database:
              process.env.OCEANBASE_MYSQL_DATABASE ??
              'nocobase_collection_builder',
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
