import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { AppDatabaseConfig } from './types.js';

export async function prepareAppDatabaseStorage(config: AppDatabaseConfig): Promise<void> {
  const connection = resolveActiveConnection(config);
  if (!connection || connection.dialect !== 'sqlite') {
    return;
  }

  if (connection.filename === ':memory:') {
    return;
  }

  await mkdir(path.dirname(connection.filename), {
    recursive: true,
  });
}

function resolveActiveConnection(config: AppDatabaseConfig): AppDatabaseConfig['connections'][string] | undefined {
  if (config.default === 'none') {
    return undefined;
  }

  const defaultConnection = config.default ? config.connections[config.default] : undefined;
  if (defaultConnection) {
    return defaultConnection;
  }

  return Object.values(config.connections)[0];
}
