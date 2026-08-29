import path from 'node:path';

import { runAppMigrations } from '@nocobase/app-server-kit/database';
import { resolveStandaloneAppRuntimeConfigSection } from '@nocobase/app-server-kit/node';

import appRuntime from '../server/runtime.js';

await migrate();

async function migrate(): Promise<void> {
  const { config: database } = resolveStandaloneAppRuntimeConfigSection(
    appRuntime,
    { rootDir: path.resolve(import.meta.dirname, '..') },
    'database',
  );
  const result = await runAppMigrations(database);

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
