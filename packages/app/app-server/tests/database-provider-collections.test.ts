// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import sqlite from '@nocobase/db-sqlite';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { afterEach, expect, it, vi } from 'vitest';

import { AppConfig, createAppPaths } from '../src/config/index.js';
import {
  DatabaseProvider,
  type AppDatabaseConfig,
} from '../src/database/index.js';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'provider-collections-'));
  roots.push(root);
  const paths = createAppPaths({ rootDir: root });
  const directory = paths.database('main/migrations');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, '001_create.ts'),
    `import { defineMigration } from '@nocobase/db';
export default defineMigration({ name: '001_create', async up({ builder }) {
  await builder.createCollection('rows', (c) => c.increments('id'));
}, async down({ builder }) { await builder.dropCollection('rows'); } });`,
  );
  const database: AppDatabaseConfig = {
    drivers: { sqlite },
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: paths.storage('main.sqlite') },
    },
  };
  return { root, paths, database };
}

/** Boots the provider the way application startup does, and returns what it left in the cache directory. */
async function boot(
  paths: ReturnType<typeof createAppPaths>,
  database: AppDatabaseConfig,
): Promise<boolean> {
  const config = new AppConfig();
  await config.loadAll();
  config.mergeDefaults({ database });
  const container = new ServiceContainer();
  const provider = new DatabaseProvider({
    config,
    container,
    paths,
    databaseTaskContributions: {
      appPackageName: 'app',
      migrations: [],
      seeds: [],
    },
  });
  provider.register();
  try {
    await provider.boot();
  } finally {
    await container.resolve(databaseManagerToken).destroy();
  }
  return existsSync(paths.database('main/collections/rows/schema.json'));
}

it('refreshes the cache after startup migrations when nocobase dev names this application', async () => {
  const { root, paths, database } = fixture();
  vi.stubEnv('NOCOBASE_COLLECTIONS_REFRESH', root);

  expect(await boot(paths, database)).toBe(true);
});

it('leaves the cache alone for another application, or without the variable', async () => {
  const hosted = fixture();
  // A Hub's in-process application sees the variable naming the Hub.
  vi.stubEnv('NOCOBASE_COLLECTIONS_REFRESH', fixture().root);
  expect(await boot(hosted.paths, hosted.database)).toBe(false);

  const production = fixture();
  vi.stubEnv('NOCOBASE_COLLECTIONS_REFRESH', '');
  expect(await boot(production.paths, production.database)).toBe(false);
  expect(existsSync(production.paths.database('main/collections'))).toBe(false);
});
