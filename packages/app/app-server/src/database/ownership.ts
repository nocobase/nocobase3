import type { ConfigPaths } from '../config/index.js';
import type { AppDatabaseConfig } from './types.js';
import { resolveAppDatabaseDriver, resolveConnections } from './manager.js';
import type { DatabaseDriverRegistration } from '@nocobase/db';

/** Catch identical configured targets. Network aliases still require operator validation. */
export function validateDatabaseOwnership(
  config: AppDatabaseConfig,
  paths?: ConfigPaths,
  drivers?: Record<string, DatabaseDriverRegistration>,
): void {
  const owners = new Map<string, string>();
  for (const [name, connection] of Object.entries(
    resolveConnections(config.connections, paths, {
      ...config.drivers,
      ...drivers,
    }),
  )) {
    if (connection.schemaManagement === 'external') continue;
    const driver = resolveAppDatabaseDriver(connection.dialect, {
      ...config.drivers,
      ...drivers,
    });
    const target = driver?.resolveOwnershipTarget
      ? driver.resolveOwnershipTarget(connection)
      : genericOwnershipTarget(
          connection as unknown as Record<string, unknown>,
        );
    if (!target) continue;
    const key = JSON.stringify(target);
    const owner = owners.get(key);
    if (owner) {
      throw new Error(
        `Managed database connections "${owner}" and "${name}" target the same database and schema. Use one managed connection per target; aliases must not own separate migration histories.`,
      );
    }
    owners.set(key, name);
  }
}

function genericOwnershipTarget(
  connection: Record<string, unknown>,
): readonly unknown[] {
  const ignored = new Set([
    'capabilities',
    'databaseDriver',
    'debug',
    'driverOptions',
    'metadataStore',
    'naming',
    'onCollectionMetadataInvalidationError',
    'password',
    'pool',
    'schemaManagement',
    'ssl',
  ]);
  return [
    connection.dialect,
    ...Object.entries(connection)
      .filter(([key, value]) => !ignored.has(key) && value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  ];
}
