import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/database';
import {
  createFilesRuntime,
  resolveFilesConfig,
} from '@nocobase/app-plugin-files/server';

import filesMigration from '../database/migrations/202608221000_files_create_files.js';
import { getFilesRuntimeKernel } from '../server/internal/runtime.js';

let database: DatabaseManager | undefined;
let storageRoot: string | undefined;

afterEach(async () => {
  await database?.destroy();
  database = undefined;
  if (storageRoot) {
    await rm(storageRoot, { recursive: true, force: true });
    storageRoot = undefined;
  }
});

describe('files runtime composition', () => {
  it('exposes an opaque runtime while composing the internal kernel and storage', async () => {
    database = createDatabaseManager({
      default: 'sqlite',
      connections: {
        sqlite: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: ':memory:',
        },
      },
    });
    await filesMigration.up(createMigrationContext(database.connection()));
    storageRoot = await mkdtemp(path.join(tmpdir(), 'nocobase-files-runtime-'));

    const runtime = createFilesRuntime({
      database,
      config: resolveFilesConfig({ appStorageRoot: storageRoot }),
      audience: 'test-app',
      secret: 'test-files-secret-at-least-32-characters',
    });
    expect(Object.keys(runtime)).toEqual([]);
    expect(runtime).not.toHaveProperty('kernel');
    expect(runtime).not.toHaveProperty('repository');
    expect(runtime).not.toHaveProperty('storage');

    const pending = await getFilesRuntimeKernel(runtime).createPending({
      name: 'runtime.txt',
    });
    expect(pending.file.status).toBe('pending');

    await runtime.dispose();
    await runtime.dispose();
    expect(() => getFilesRuntimeKernel(runtime)).toThrow(
      'Files runtime is invalid or disposed.',
    );
  });
});
