import {
  createDatabaseManager,
  createMigrator,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/app-database';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface HubDatabaseOptions {
  filename?: string;
  migrationsDirectory?: string;
}

export interface HubDatabaseRuntime {
  database: DatabaseManager;
  connection: DatabaseConnection;
  ready: Promise<void>;
  close(): Promise<void>;
}

export function createHubDatabase(
  options: HubDatabaseOptions = {},
): HubDatabaseRuntime {
  const filename =
    options.filename ?? path.resolve(process.cwd(), '.nocobase/hub.sqlite');
  const database = createDatabaseManager({
    default: 'default',
    connections: {
      default: {
        dialect: 'sqlite',
        filename,
      },
    },
  });
  const connection = database.connection();
  const migrationsDirectory =
    options.migrationsDirectory ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
  const ready = prepareSqliteStorage(filename)
    .then(() =>
      createMigrator({
        database,
        directory: migrationsDirectory,
        tableName: 'hubMigrations',
        lockTableName: 'hubMigrationLocks',
      }).latest(),
    )
    .then(() => undefined)
    .catch(async (error: unknown) => {
      await database.destroy();
      throw error;
    });

  return {
    database,
    connection,
    ready,
    async close(): Promise<void> {
      await ready.catch(() => undefined);
      await database.destroy();
    },
  };
}

async function prepareSqliteStorage(filename: string): Promise<void> {
  if (filename === ':memory:' || filename.startsWith('file:')) {
    return;
  }

  await mkdir(path.dirname(path.resolve(filename)), { recursive: true });
}
