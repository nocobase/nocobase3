import path from 'node:path';

import { runAppMigrations } from '@nocobase/app-server/database';
import { databaseConfig } from '@nocobase/app-server/database';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';

import appRuntime from '../server/runtime.js';

await migrate();

async function migrate(): Promise<void> {
  const runtime = await resolveStandaloneAppRuntime(appRuntime, {
    rootDir: path.resolve(import.meta.dirname, '..'),
  });
  const result = await runAppMigrations(
    runtime.appConfig.get(databaseConfig),
    runtime.configPaths,
  );

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
