// The lab on a real SQLite database: the approval plugin's migration and the
// example's, one runtime on the Repository store, and a dispatcher that
// queues effect runs for the test to run when it chooses.
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import {
  createRepositoryLifecycleStore,
  LifecycleRuntime,
} from '@nocobase/lifecycle';

import packageMetadata from '../../package.json' with { type: 'json' };
import { ApprovalCenter } from '../../server/lab/center.js';
import { ApprovalExampleService } from '../../server/lab/service.js';
import { APPROVAL_EXAMPLE_COLLECTIONS } from '../../server/scope.js';

const require = createRequire(import.meta.url);

/** The approval plugin's own migrations, which the application also runs. */
export const APPROVAL_MIGRATIONS: string = path.resolve(
  path.dirname(require.resolve('@nocobase/app-plugin-approval/package.json')),
  'database/migrations',
);

export const EXAMPLE_MIGRATIONS: string = path.resolve(
  import.meta.dirname,
  '../../database/migrations',
);

export interface TestLab {
  readonly database: DatabaseManager;
  readonly lab: ApprovalExampleService;
  readonly center: ApprovalCenter;
  /** A runtime on the same database, as a restarted process would have. */
  runtime(): LifecycleRuntime;
  /** Runs every queued effect, and the ones those queue, until none is left. */
  drain(): Promise<void>;
  destroy(): Promise<void>;
}

export async function createTestLab(): Promise<TestLab> {
  // A file, not :memory:, so the pool behaves as it does in an application.
  const folder = await mkdtemp(path.join(os.tmpdir(), 'approval-example-'));
  const database = createDatabaseManager({
    default: 'main',
    drivers: { sqlite },
    connections: {
      main: { dialect: 'sqlite', filename: path.join(folder, 'main.sqlite') },
    },
  });
  for (const [directory, packageName] of [
    [APPROVAL_MIGRATIONS, '@nocobase/app-plugin-approval'],
    [EXAMPLE_MIGRATIONS, packageMetadata.name],
  ] as const)
    await database
      .createMigrator({ connection: 'main', directory, packageName })
      .latest();
  const queued: string[] = [];
  const runtime = (): LifecycleRuntime =>
    new LifecycleRuntime({
      store: createRepositoryLifecycleStore(database, {
        collections: {
          transitions: APPROVAL_EXAMPLE_COLLECTIONS.transitions,
          effectRuns: APPROVAL_EXAMPLE_COLLECTIONS.effectRuns,
        },
      }),
      dispatcher: {
        dispatch: (runId) => {
          queued.push(runId);
          return Promise.resolve();
        },
      },
    });
  const lab = new ApprovalExampleService(database, runtime());
  await lab.start();
  return {
    database,
    lab,
    center: new ApprovalCenter(lab),
    runtime,
    drain: async () => {
      for (let round = 0; round < 50 && queued.length; round += 1)
        for (const runId of queued.splice(0))
          await lab.runtime.runEffect(runId);
    },
    destroy: async () => {
      await database.destroy();
      await rm(folder, { recursive: true, force: true });
    },
  };
}
