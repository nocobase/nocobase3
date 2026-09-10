import { createDatabaseManager } from '@nocobase/db';
import {
  createDatabaseIntegrationAdapter,
  dropPortableIntegrationObjects,
  type DatabaseIntegrationAdapter,
} from '@nocobase/db-testkit';
import oracle from '../../src/index.js';

export const oracleIntegrationAdapter: DatabaseIntegrationAdapter =
  createDatabaseIntegrationAdapter({
    name: 'oracle',
    createDatabase: (prefix, metadataStore) =>
      createDatabaseManager({
        default: 'main',
        metadataStore,
        connections: {
          main: oracle({
            host: process.env.ORACLE_HOST ?? '127.0.0.1',
            port: Number(process.env.ORACLE_PORT ?? 11521),
            username: process.env.ORACLE_USER ?? 'nocobase',
            password: process.env.ORACLE_PASSWORD ?? 'nocobase',
            serviceName: process.env.ORACLE_SERVICE_NAME ?? 'FREEPDB1',
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
