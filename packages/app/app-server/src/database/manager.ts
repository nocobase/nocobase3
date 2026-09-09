import {
  createDatabaseManager,
  defineDatabase,
  type ConnectionConfig,
  type DatabaseManager,
} from '@nocobase/db';

import type { ConfigPaths } from '../config/index.js';
import type { AppDatabaseConfig } from './types.js';

export function createAppDatabaseManager(
  config: AppDatabaseConfig,
  paths?: ConfigPaths,
): DatabaseManager | undefined {
  if (config.default === 'none') {
    return undefined;
  }

  return createDatabaseManager(
    defineDatabase({
      default: config.default,
      connections: resolveConnections(config.connections, paths),
      metadataStore: config.metadataStore,
    }),
  );
}

export function resolveConnections(
  connections: AppDatabaseConfig['connections'],
  paths: ConfigPaths | undefined,
): Record<string, ConnectionConfig> {
  return Object.fromEntries(
    Object.entries(connections).map(([name, config]) => {
      const { migrations: _migrations, seeds: _seeds, ...connection } = config;
      return [name, normalizeConnection(connection, paths)];
    }),
  );
}

function normalizeConnection(
  connection: ConnectionConfig,
  paths: ConfigPaths | undefined,
): ConnectionConfig {
  switch (connection.dialect) {
    case 'mysql':
      return {
        ...(connection.socketPath ? {} : { host: '127.0.0.1', port: 3306 }),
        database: 'app',
        username: 'root',
        password: '',
        charset: 'utf8mb4',
        ...connection,
      } as ConnectionConfig;
    case 'postgres':
      return {
        host: '127.0.0.1',
        port: 5432,
        database: 'app',
        username: 'postgres',
        password: '',
        ssl: false,
        schema: ['public'],
        ...connection,
      };
    case 'oracle':
      return {
        ...connection,
        host: connection.host ?? '127.0.0.1',
        port: connection.port ?? 1521,
        serviceName: connection.serviceName || 'FREEPDB1',
        username: connection.username ?? 'nocobase',
        password: connection.password ?? '',
      };
    case 'mssql':
      return {
        host: '127.0.0.1',
        port: 1433,
        database: 'app',
        username: 'sa',
        password: '',
        encrypt: false,
        trustServerCertificate: false,
        ...connection,
      };
    case 'sqlite': {
      const database = (connection as ConnectionConfig & { database?: string })
        .database;
      const filename = database ?? connection.filename;
      return {
        ...connection,
        filename:
          filename && filename !== ':memory:' && paths
            ? paths.storage(filename)
            : filename,
      };
    }
  }
}
