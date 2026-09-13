import {
  createDatabaseManager,
  defineDatabase,
  type ConnectionConfig,
  type DatabaseDriverDefinition,
  type DatabaseDriverRegistration,
  type DatabaseManager,
} from '@nocobase/db';

import type { ConfigPaths } from '../config/index.js';
import type { AppDatabaseConfig } from './types.js';

/**
 * Builds the manager from the application's own database config.
 *
 * The app-server package deliberately does not depend on any concrete database
 * driver. An application declares the dialect packages it installs under
 * `database.drivers`, which is what every entry point — the runtime, the CLI
 * commands and the tests — resolves a dialect from.
 */
export function createAppDatabaseManager(
  config: AppDatabaseConfig,
  paths?: ConfigPaths,
  drivers?: Record<string, DatabaseDriverRegistration>,
): DatabaseManager | undefined {
  if (config.default === 'none') {
    return undefined;
  }

  return createDatabaseManager(
    defineDatabase({
      default: config.default,
      drivers: {
        ...config.drivers,
        ...drivers,
      },
      connections: resolveConnections(config.connections, paths, {
        ...config.drivers,
        ...drivers,
      }),
      metadataStore: config.metadataStore,
    }),
  );
}

export function resolveConnections(
  connections: AppDatabaseConfig['connections'],
  paths: ConfigPaths | undefined,
  drivers?: Record<string, DatabaseDriverRegistration>,
): Record<string, ConnectionConfig> {
  return Object.fromEntries(
    Object.entries(connections).map(([name, config]) => {
      const { migrations: _migrations, seeds: _seeds, ...connection } = config;
      return [name, normalizeConnection(connection, paths, drivers)];
    }),
  );
}

function normalizeConnection(
  connection: ConnectionConfig,
  paths: ConfigPaths | undefined,
  drivers?: Record<string, DatabaseDriverRegistration>,
): ConnectionConfig {
  const driver = resolveAppDatabaseDriver(connection.dialect, drivers);
  if (!driver?.normalizeConnection) return connection;
  return driver.normalizeConnection(connection, {
    resolveStoragePath: paths
      ? (filename) => paths.storage(filename)
      : undefined,
  }) as ConnectionConfig;
}

export function resolveAppDatabaseDriver(
  dialect: string,
  drivers?: Record<string, DatabaseDriverRegistration>,
): DatabaseDriverDefinition | undefined {
  const value = drivers?.[dialect];
  if (!value) return undefined;
  const candidate = value as DatabaseDriverRegistration & {
    driver?: DatabaseDriverDefinition;
  };
  if (typeof candidate === 'function') {
    return candidate.driver;
  }
  return candidate;
}
