// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runDatabaseCommand } from '../../cli/database-command.js';
import {
  createConfigPaths,
  type AppConfigAccessor,
} from '@nocobase/app-server/config';
import type { AppDatabaseConfig } from '@nocobase/app-server/database';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'cli-database-'));
  roots.push(root);
  const paths = createConfigPaths({ rootDir: root });
  const database: AppDatabaseConfig = {
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: paths.storage('main.sqlite') },
      analytics: {
        dialect: 'sqlite',
        filename: paths.storage('analytics.sqlite'),
        migrations: { autoRun: false },
      },
      erp: {
        dialect: 'sqlite',
        filename: paths.storage('erp.sqlite'),
        schemaManagement: 'external',
      },
    },
  };
  const runtime = async () => ({
    config: { get: () => database } as unknown as AppConfigAccessor,
    configPaths: paths,
  });
  const command = {
    log: vi.fn(),
    logJson: vi.fn(),
    exit: vi.fn((code: number): never => {
      throw new Error(`exit ${code}`);
    }),
  };
  function migration(connection: string, fail = false) {
    const directory = paths.database(`${connection}/migrations`);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, '001_create.ts'),
      `import { defineMigration } from '@nocobase/db';
export default defineMigration({ name: '001_create', async up({ builder }) {
${fail ? "throw new Error('failed migration');" : "await builder.createCollection('rows', c => c.increments('id'));"}
}, async down({ builder }) { await builder.dropCollection('rows'); } });`,
    );
  }
  return { runtime, command, migration };
}

it('retains single-connection JSON fields and honors manual selection', async () => {
  const { runtime, command, migration } = fixture();
  migration('analytics');
  await runDatabaseCommand(
    command,
    'migrations',
    { json: true, all: false, connection: 'analytics' },
    runtime,
  );
  expect(command.logJson).toHaveBeenCalledWith({
    ok: true,
    status: 'completed',
    connection: 'analytics',
    batch: 1,
    executed: ['001_create'],
    skipped: [],
  });
  expect(command.exit).not.toHaveBeenCalled();
});

it('reports external skips in all-connection JSON', async () => {
  const { runtime, command } = fixture();
  await runDatabaseCommand(
    command,
    'seeds',
    { json: true, all: true },
    runtime,
  );
  expect(command.logJson).toHaveBeenCalledWith(
    expect.objectContaining({
      ok: true,
      results: expect.arrayContaining([
        {
          connection: 'erp',
          kind: 'seeds',
          status: 'skipped',
          reason: 'external',
        },
      ]),
    }),
  );
});

it('prints partial failure JSON before exiting nonzero', async () => {
  const { runtime, command, migration } = fixture();
  migration('main');
  migration('analytics', true);
  await expect(
    runDatabaseCommand(
      command,
      'migrations',
      { json: true, all: true },
      runtime,
    ),
  ).rejects.toThrow('exit 1');
  expect(command.logJson).toHaveBeenCalledWith(
    expect.objectContaining({
      ok: false,
      results: [
        expect.objectContaining({ connection: 'main', status: 'completed' }),
        expect.objectContaining({ connection: 'analytics', status: 'failed' }),
        expect.objectContaining({ connection: 'erp', status: 'not-run' }),
      ],
    }),
  );
});

it('reports invalid selection as JSON and exits nonzero', async () => {
  const { runtime, command } = fixture();
  await expect(
    runDatabaseCommand(
      command,
      'migrations',
      { json: true, all: false, connection: 'unknown' },
      runtime,
    ),
  ).rejects.toThrow('exit 1');
  expect(command.logJson).toHaveBeenCalledWith(
    expect.objectContaining({
      ok: false,
      connection: 'unknown',
      error: expect.stringContaining('Unknown'),
    }),
  );
});
