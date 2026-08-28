import { runAppSeeds } from '@nocobase/app-server-kit/database';

import { loadStandaloneDatabaseTaskConfig } from '../server/runtime/config.js';

await seed();

async function seed(): Promise<void> {
  const config = loadStandaloneDatabaseTaskConfig();
  const result = await runAppSeeds(config.database);

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
