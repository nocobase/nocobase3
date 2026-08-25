import { prepareAppDatabaseStorage } from '@nocobase/app-runtime/database';

import { createStandaloneDatabaseTaskRuntime } from '../server/database-task.js';

await seed();

async function seed(): Promise<void> {
  const runtime = createStandaloneDatabaseTaskRuntime();

  try {
    await prepareAppDatabaseStorage(runtime.config.database);
    const result = await runtime.runSeeds();

    if (!result) {
      console.log('No database seeder is configured.');
      return;
    }

    if (result.status === 'skipped') {
      console.log(`Database seeds skipped: ${result.reason}.`);
      return;
    }

    console.log('Database seeds completed.');
    logSeedNames('Executed', result.executed ?? []);
    logSeedNames('Skipped', result.skipped ?? []);
  } finally {
    await runtime.dispose();
  }
}

function logSeedNames(label: string, names: readonly string[]): void {
  if (names.length === 0) {
    console.log(`${label}: none`);
    return;
  }

  console.log(`${label}:`);
  for (const name of names) {
    console.log(`- ${name}`);
  }
}
