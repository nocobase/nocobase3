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

const registeredDrivers: Record<string, DatabaseDriverRegistration> = {};

/**
 * Registers the dialect packages owned by the application composition root.
 *
 * The app-server package deliberately does not depend on any concrete
 * database driver. Applications can register exactly the packages they
 * install, while tests and command entry points can share the same registry.
 */
export function registerAppDatabaseDrivers(
  drivers: Record<string, DatabaseDriverRegistration>,
): void {
  Object.assign(registeredDrivers, drivers);
}

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
        ...registeredDrivers,
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
  const value = { ...registeredDrivers, ...drivers }[dialect];
  if (!value) return undefined;
  const candidate = value as DatabaseDriverRegistration & {
    driver?: DatabaseDriverDefinition;
  };
  if (typeof candidate === 'function') {
    return candidate.driver;
  }
  return candidate;
}
