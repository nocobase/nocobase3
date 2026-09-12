import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ConfigPaths } from '../config/index.js';
import type { AppDatabaseConfig } from './types.js';
import { resolveConnections } from './manager.js';
import { defaultConnectionName } from './plan.js';

export async function prepareAppDatabaseStorage(
  config: AppDatabaseConfig,
  paths?: ConfigPaths,
  names?: readonly string[],
): Promise<void> {
  if (config.default === 'none') return;
  const primary = defaultConnectionName(config);
  const connections = resolveConnections(config.connections, paths);
  for (const name of names ?? (primary ? [primary] : [])) {
    const connection = connections[name];
    if (!connection) throw new Error(`Unknown database connection "${name}".`);
    if (connection.dialect !== 'sqlite') continue;
    const filename = connection.filename;
    if (!filename || filename === ':memory:') continue;
    await mkdir(path.dirname(filename), { recursive: true });
  }
}
