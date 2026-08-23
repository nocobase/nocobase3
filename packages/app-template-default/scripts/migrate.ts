import { prepareAppDatabaseStorage } from '@nocobase/app-server/database';

import { createStandaloneDatabaseTaskRuntime } from '../server/database-task.js';

await migrate();

async function migrate(): Promise<void> {
  const runtime = createStandaloneDatabaseTaskRuntime();

  try {
    await prepareAppDatabaseStorage(runtime.config.database);
    const result = await runtime.runMigrations();

    if (!result) {
      console.log('No database migrator is configured.');
      return;
    }

    if (result.status === 'skipped') {
      console.log(`Database migrations skipped: ${result.reason}.`);
      return;
    }

    console.log('Database migrations completed.');
    console.log(`Batch: ${result.batch ?? 0}`);
    logMigrationNames('Executed', result.executed ?? []);
    logMigrationNames('Skipped', result.skipped ?? []);
  } finally {
    await runtime.dispose();
  }
}

function logMigrationNames(label: string, names: readonly string[]): void {
  if (names.length === 0) {
    console.log(`${label}: none`);
    return;
  }

  console.log(`${label}:`);
  for (const name of names) {
    console.log(`- ${name}`);
  }
}
