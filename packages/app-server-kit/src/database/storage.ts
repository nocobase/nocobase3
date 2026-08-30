import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ConfigPaths } from '../config/index.js';
import type { AppDatabaseConfig } from './types.js';

export async function prepareAppDatabaseStorage(
  config: AppDatabaseConfig,
  paths?: ConfigPaths,
): Promise<void> {
  const connection = resolveActiveConnection(config);
  if (!connection || connection.dialect !== 'sqlite') {
    return;
  }

  const filename = resolveSqliteFilename(connection, paths);
  if (!filename || filename === ':memory:') {
    return;
  }

  await mkdir(path.dirname(filename), {
    recursive: true,
  });
}

function resolveSqliteFilename(
  connection: AppDatabaseConfig['connections'][string],
  paths: ConfigPaths | undefined,
): string | undefined {
  if (connection.dialect !== 'sqlite') return undefined;
  const database = (connection as typeof connection & { database?: string })
    .database;
  return database && paths ? paths.storage(database) : connection.filename;
}

function resolveActiveConnection(
  config: AppDatabaseConfig,
): AppDatabaseConfig['connections'][string] | undefined {
  if (config.default === 'none') {
    return undefined;
  }

  const defaultConnection = config.default
    ? config.connections[config.default]
    : undefined;
  if (defaultConnection) {
    return defaultConnection;
  }

  return Object.values(config.connections)[0];
}
