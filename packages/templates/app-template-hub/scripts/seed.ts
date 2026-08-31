import path from 'node:path';

import { runAppSeeds } from '@nocobase/app-server/database';
import { databaseConfig } from '@nocobase/app-server/database';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';

import appRuntime from '../server/runtime.js';

await seed();

async function seed(): Promise<void> {
  const runtime = await resolveStandaloneAppRuntime(appRuntime, {
    rootDir: path.resolve(import.meta.dirname, '..'),
  });
  const result = await runAppSeeds(
    runtime.appConfig.get(databaseConfig),
    runtime.configPaths,
  );

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
