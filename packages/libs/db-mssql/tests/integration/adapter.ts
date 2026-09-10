import { createDatabaseManager } from '@nocobase/db';
import {
  createDatabaseIntegrationAdapter,
  dropPortableIntegrationObjects,
  type DatabaseIntegrationAdapter,
} from '@nocobase/db-testkit';
import mssql from '../../src/index.js';

export const mssqlIntegrationAdapter: DatabaseIntegrationAdapter =
  createDatabaseIntegrationAdapter({
    name: 'mssql',
    createDatabase: (prefix, metadataStore) =>
      createDatabaseManager({
        default: 'main',
        metadataStore,
        connections: {
          main: mssql({
            host: process.env.MSSQL_HOST ?? '127.0.0.1',
            port: Number(process.env.MSSQL_PORT ?? 11433),
            username: process.env.MSSQL_USER ?? 'sa',
            password: process.env.MSSQL_PASSWORD ?? 'NocoBase_Mssql_2026',
            database:
              process.env.MSSQL_DATABASE ?? 'nocobase_collection_builder',
            encrypt: false,
            trustServerCertificate: true,
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
