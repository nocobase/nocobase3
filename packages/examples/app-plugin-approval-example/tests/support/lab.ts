// The lab on a selected test database: the approval plugin's migration and the
// example's, one runtime on the Repository store, and a dispatcher that
// queues effect runs for the test to run when it chooses.
import { createRequire } from 'node:module';
import path from 'node:path';

import { createTestDatabase } from '@nocobase/app-testing/server';
import type { DatabaseManager } from '@nocobase/db';
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
  const fixture = await createTestDatabase({
    migrations: [
      {
        directory: APPROVAL_MIGRATIONS,
        packageName: '@nocobase/app-plugin-approval',
      },
      { directory: EXAMPLE_MIGRATIONS, packageName: packageMetadata.name },
    ],
  });
  const database = fixture.database;
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
      await fixture.destroy();
    },
  };
}
