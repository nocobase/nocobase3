import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import type { AppQueueConfig } from '../types.js';

/** Physical queue schema, also available to standalone database consumers. */
export const queueMigrationSource: MigrationSource = {
  packageName: '@nocobase/queue',
  directory: path.join(import.meta.dirname, 'migrations'),
};

export interface QueueMigrationTarget {
  readonly connection: string;
  readonly source: MigrationSource;
}

/** Resolve queue-owned configuration without depending on the application runtime. */
export function resolveQueueMigrationSources(
  config: AppQueueConfig | undefined,
  options: { readonly defaultDatabaseConnection?: string },
): QueueMigrationTarget[] {
  const targets = new Map<string, QueueMigrationTarget>();
  const activeTables = new Map<string, string>();
  for (const configuration of Object.values(config?.connections ?? {})) {
    const storage =
      configuration.driver === 'database' ? configuration : undefined;
    const connection = storage?.connection ?? options.defaultDatabaseConnection;
    if (!connection || connection === 'none') continue;
    const parameters = {
      jobsTable: storage?.table ?? 'queue_jobs',
      schedulesTable: storage?.schedulesTable ?? 'queue_schedules',
    };
    const tables = Object.values(parameters);
    for (const table of tables) {
      if (
        !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table) ||
        table.startsWith('__nocobase_')
      ) {
        throw new Error(
          `Invalid queue physical table name "${table}" on connection "${connection}".`,
        );
      }
    }
    if (new Set(tables).size !== tables.length) {
      throw new Error(
        `Queue targets require different physical tables on connection "${connection}".`,
      );
    }
    const key = JSON.stringify([connection, parameters]);
    if (storage) {
      for (const table of tables) {
        const tableKey = JSON.stringify([connection, table]);
        const previous = activeTables.get(tableKey);
        if (previous && previous !== key) {
          throw new Error(
            `Conflicting queue migration targets for table "${table}" on connection "${connection}".`,
          );
        }
        activeTables.set(tableKey, key);
      }
    }
    const previous = targets.get(key);
    targets.set(key, {
      connection,
      source: {
        ...queueMigrationSource,
        parameters,
        configuration: [
          ...(previous?.source.configuration ?? []),
          { ...configuration },
        ],
      },
    });
  }
  return [...targets.values()];
}
