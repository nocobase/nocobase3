import { runAppMigrations } from '@nocobase/app-server-kit/database';

import { loadStandaloneDatabaseTaskConfig } from '../server/runtime/config.js';

await migrate();

async function migrate(): Promise<void> {
  const config = loadStandaloneDatabaseTaskConfig();
  const result = await runAppMigrations(config.database);

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
