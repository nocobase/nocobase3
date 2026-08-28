import { runAppSeeds } from '@nocobase/app-server-kit/database';

import { createStandaloneDatabaseTaskRuntime } from '../server/database-task.js';

await seed();

async function seed(): Promise<void> {
  const runtime = createStandaloneDatabaseTaskRuntime();
  const result = await runAppSeeds(runtime.config.database);

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
