import {
  createDatabaseManager,
  defineDatabase,
  type ConnectionConfig,
  type DatabaseManager,
} from '@nocobase/app-database';

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
    }),
  );
}

function resolveConnections(
  connections: AppDatabaseConfig['connections'],
  paths: ConfigPaths | undefined,
): AppDatabaseConfig['connections'] {
  const main = connections.main;
  if (!main) return connections;
  if (main.dialect === 'mysql') {
    return {
      ...connections,
      main: {
        host: '127.0.0.1',
        port: 3306,
        database: 'app',
        username: 'root',
        password: '',
        charset: 'utf8mb4',
        ...main,
      } as ConnectionConfig,
    };
  }
  if (main.dialect === 'postgres') {
    return {
      ...connections,
      main: {
        host: '127.0.0.1',
        port: 5432,
        database: 'app',
        username: 'postgres',
        password: '',
        ssl: false,
        schema: ['public'],
        ...main,
      },
    };
  }
  const database = (main as ConnectionConfig & { database?: string }).database;
  if (!database || !paths) return connections;
  return {
    ...connections,
    main: { ...main, filename: paths.storage(database) },
  };
}
