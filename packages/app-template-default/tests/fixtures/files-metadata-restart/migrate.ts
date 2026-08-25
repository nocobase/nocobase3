import { fileURLToPath } from 'node:url';

import type { AppDatabaseConfig } from '@nocobase/app-server/database';
import { createAppRuntime } from '@nocobase/app-server/runtime';

const filename = process.argv[2];
if (!filename) {
  throw new Error('Expected a SQLite filename.');
}

const database: AppDatabaseConfig = {
  default: 'sqlite',
  connections: {
    sqlite: {
      dialect: 'sqlite',
      driver: 'better-sqlite3',
      filename,
      pool: { min: 1, max: 1 },
    },
  },
  migrations: {
    directory: fileURLToPath(new URL('./database/migrations', import.meta.url)),
    autoRun: false,
    sources: [
      {
        packageName: '@nocobase/app-plugin-files',
        directory: fileURLToPath(
          new URL(
            '../../../../app-plugin-files/database/migrations',
            import.meta.url,
          ),
        ),
      },
      {
        packageName: '@nocobase/files-metadata-restart-test',
        directory: fileURLToPath(
          new URL('./database/migrations', import.meta.url),
        ),
      },
    ],
  },
};
const runtime = createAppRuntime({ database });

try {
  const result = await runtime.runMigrations();
  if (
    result?.status !== 'completed' ||
    !result.executed?.includes('202608221000_files_create_files') ||
    !result.executed.includes('202608251000_create_restart_documents')
  ) {
    throw new Error('Expected the Files restart migrations to execute.');
  }
} finally {
  await runtime.dispose();
}
