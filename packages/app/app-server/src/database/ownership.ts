import path from 'node:path';

import type { ConfigPaths } from '../config/index.js';
import type { AppDatabaseConfig } from './types.js';
import { resolveConnections } from './manager.js';

/** Catch identical configured targets. Network aliases still require operator validation. */
export function validateDatabaseOwnership(
  config: AppDatabaseConfig,
  paths?: ConfigPaths,
): void {
  const owners = new Map<string, string>();
  for (const [name, connection] of Object.entries(
    resolveConnections(config.connections, paths),
  )) {
    if (connection.schemaManagement === 'external') continue;
    let target: unknown;
    if (connection.dialect === 'sqlite') {
      if (!connection.filename || connection.filename === ':memory:') continue;
      target = ['sqlite', path.resolve(connection.filename)];
    } else {
      const schema =
        connection.dialect === 'postgres'
          ? ((typeof connection.schema === 'string'
              ? connection.schema
              : connection.schema?.[0]) ?? 'public')
          : connection.dialect === 'oracle'
            ? connection.username
            : connection.dialect === 'mssql'
              ? 'dbo'
              : undefined;
      target = [
        connection.dialect,
        connection.host,
        connection.port,
        connection.dialect === 'mysql' ? connection.socketPath : undefined,
        connection.dialect === 'oracle'
          ? connection.serviceName
          : connection.database,
        schema,
      ];
    }
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
