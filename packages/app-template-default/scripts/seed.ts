import path from 'node:path';

import { runAppSeeds } from '@nocobase/app-server-kit/database';
import { resolveStandaloneAppRuntimeConfigSection } from '@nocobase/app-server-kit/node';

import appRuntime from '../server/runtime.js';

await seed();

async function seed(): Promise<void> {
  const { config: database } = resolveStandaloneAppRuntimeConfigSection(
    appRuntime,
    { rootDir: path.resolve(import.meta.dirname, '..') },
    'database',
  );
  const result = await runAppSeeds(database);

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
