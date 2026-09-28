import { mkdir } from 'node:fs/promises';

import {
  resolveDatabaseDriver,
  type DatabaseDriverRegistration,
} from '@nocobase/db';
import type { AppPaths } from '../config/index.js';
import type { AppDatabaseConfig } from './types.js';
import { resolveConnections } from './manager.js';
import { defaultConnectionName } from './plan.js';

export async function prepareAppDatabaseStorage<
  TConfig extends AppDatabaseConfig,
>(
  config: TConfig,
  paths?: AppPaths,
  names?: readonly string[],
  drivers?: Record<string, DatabaseDriverRegistration>,
): Promise<void> {
  if (config.default === 'none') return;
  const primary = defaultConnectionName(config);
  const availableDrivers = { ...config.drivers, ...drivers };
  const connections = resolveConnections(
    config.connections,
    paths,
    availableDrivers,
  );
  for (const name of names ?? (primary ? [primary] : [])) {
    const connection = connections[name];
    if (!connection) throw new Error(`Unknown database connection "${name}".`);
    const driver = resolveDatabaseDriver(connection, availableDrivers, name);
    await driver?.prepareStorage?.(connection, {
      ensureDirectory: async (directory) => {
        await mkdir(directory, { recursive: true });
      },
    });
  }
}

/**
 * Whether the storage of connection `name` exists already. A driver that
 * does not say, which is every driver without local storage, has it.
 */
export async function appDatabaseStorageExists<
  TConfig extends AppDatabaseConfig,
>(
  config: TConfig,
  paths: AppPaths | undefined,
  name: string,
  drivers?: Record<string, DatabaseDriverRegistration>,
): Promise<boolean> {
  if (config.default === 'none') return true;
  const availableDrivers = { ...config.drivers, ...drivers };
  const connection = resolveConnections(
    config.connections,
    paths,
    availableDrivers,
  )[name];
  if (!connection) throw new Error(`Unknown database connection "${name}".`);
  const driver = resolveDatabaseDriver(connection, availableDrivers, name);
  return (await driver?.hasStorage?.(connection)) ?? true;
}
