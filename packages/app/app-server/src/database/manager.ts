import {
  createDatabaseManager,
  defineDatabase,
  type ConnectionConfig,
  type DatabaseDriverDefinition,
  type DatabaseDriverRegistration,
  type DatabaseManager,
} from '@nocobase/db';

import type { ConfigPaths } from '../config/index.js';
import { resolveAppMetadataStore } from './collections-directory.js';
import type {
  AppDatabaseConfig,
  AppDatabaseMigrationConfig,
  AppDatabaseSeedConfig,
} from './types.js';

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
      connections: resolveConnections(
        config.connections,
        paths,
        {
          ...config.drivers,
          ...drivers,
        },
        config.metadataStore,
        config,
      ),
      metadataStore: resolveAppMetadataStore(config.metadataStore, {
        name: '',
        external: false,
        paths,
      }),
    }),
  );
}

export function resolveConnections(
  connections: AppDatabaseConfig['connections'],
  paths: ConfigPaths | undefined,
  drivers?: Record<string, DatabaseDriverRegistration>,
  sharedMetadataStore?: AppDatabaseConfig['metadataStore'],
  /** The top-level task configuration, whose legacy `migrations`/`seeds` apply to the default connection. */
  tasks?: Pick<AppDatabaseConfig, 'default' | 'migrations' | 'seeds'>,
): Record<string, ConnectionConfig> {
  const primary = tasks?.default ?? Object.keys(connections)[0];
  return Object.fromEntries(
    Object.entries(connections).map(([name, config]) => {
      const { migrations, seeds, metadataStore, ...connection } = config;
      const resolved = resolveAppMetadataStore(metadataStore, {
        name,
        external: connection.schemaManagement === 'external',
        shared: sharedMetadataStore,
        paths,
      });
      const internalTables = bookkeepingTables(
        [migrations, seeds],
        name === primary ? [tasks?.migrations, tasks?.seeds] : [],
        connection.internalTables,
      );
      return [
        name,
        normalizeConnection(
          {
            ...connection,
            ...(resolved === undefined ? {} : { metadataStore: resolved }),
            ...(internalTables.length > 0 ? { internalTables } : {}),
          },
          paths,
          drivers,
        ),
      ];
    }),
  );
}

/**
 * A migration or seed history or lock table given a custom name is still
 * bookkeeping, not a Collection, but only this layer knows the name: the
 * connection is told so `collections.list()` and `scan()` skip it. Default
 * names carry the `__nocobase_` prefix and need no declaration.
 */
function bookkeepingTables(
  local: readonly (
    | Partial<AppDatabaseMigrationConfig>
    | Partial<AppDatabaseSeedConfig>
    | undefined
  )[],
  legacy: readonly (
    | Partial<AppDatabaseMigrationConfig>
    | Partial<AppDatabaseSeedConfig>
    | undefined
  )[],
  declared: readonly string[] | undefined,
): string[] {
  const names = new Set(declared ?? []);
  for (const task of [...local, ...legacy]) {
    if (task?.tableName) names.add(task.tableName);
    if (task?.lockTableName) names.add(task.lockTableName);
  }
  return [...names].sort();
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
