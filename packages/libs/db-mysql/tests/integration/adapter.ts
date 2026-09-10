import { createDatabaseManager } from '@nocobase/db';
import {
  createDatabaseIntegrationAdapter,
  dropPortableIntegrationObjects,
  type DatabaseIntegrationAdapter,
} from '@nocobase/db-testkit';
import mysql from '../../src/index.js';

export const mysqlIntegrationAdapter: DatabaseIntegrationAdapter =
  createDatabaseIntegrationAdapter({
    name: 'mysql',
    createDatabase: (prefix, metadataStore) =>
      createDatabaseManager({
        default: 'main',
        metadataStore,
        connections: {
          main: mysql({
            host: process.env.MYSQL_HOST ?? '127.0.0.1',
            port: Number(process.env.MYSQL_PORT ?? 13306),
            username: process.env.MYSQL_USER ?? 'nocobase',
            password: process.env.MYSQL_PASSWORD ?? 'nocobase',
            database:
              process.env.MYSQL_DATABASE ?? 'nocobase_collection_builder',
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
