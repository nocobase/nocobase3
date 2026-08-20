import { prepareAppDatabaseStorage } from '@nocobase/app-server/database';
import type { AppRuntime } from '@nocobase/app-server/runtime';

/** Runs and reports the migrations configured by an application runtime. */
export async function runAppMigrations(runtime: AppRuntime): Promise<void> {
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
