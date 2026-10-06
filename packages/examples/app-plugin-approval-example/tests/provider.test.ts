// @vitest-environment node
// The real Provider against SQLite and the memory jobs service: an approval
// decided through the service sends its record on, and the effects that
// follow run as jobs.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createAppPaths } from '@nocobase/app-server/config';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { loggingToken } from '@nocobase/app-server/logging';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  createDatabaseManager,
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { createJobExecutorService } from '@nocobase/jobs';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';

import packageMetadata from '../package.json' with { type: 'json' };
import { ApprovalExampleProvider } from '../server/providers/approval-example.js';
import { approvalExampleServiceToken } from '../server/tokens.js';
import { APPROVAL_MIGRATIONS, EXAMPLE_MIGRATIONS } from './support/lab.js';

let directory: string;
let database: DatabaseManager;

const logger = { info: () => {}, warn: () => {}, error: () => {} };

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'approval-provider-'));
  database = createDatabaseManager({
    drivers: { sqlite },
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(directory, 'main.sqlite'),
      },
    },
  });
  for (const [migrations, packageName] of [
    [APPROVAL_MIGRATIONS, '@nocobase/app-plugin-approval'],
    [EXAMPLE_MIGRATIONS, packageMetadata.name],
  ] as const)
    await database
      .createMigrator({ directory: migrations, packageName })
      .latest();
});

afterEach(async () => {
  await database.destroy();
  await rm(directory, { recursive: true, force: true });
});

async function eventually<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('The condition never held.');
}

it('decides a leave request and registers it on the jobs service', async () => {
  const jobs = createJobExecutorService(undefined, {
    appName: 'main',
    storagePath: path.join(directory, 'jobs'),
  });
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, database);
  container.instance(jobExecutorServiceToken, jobs);
  container.instance(loggingToken, { getLogger: () => logger } as never);
  const app: AppPluginApplication = {
    appName: 'main',
    publicBasePath: '',
    config: {} as never,
    paths: createAppPaths({ rootDir: directory }),
    router: new Hono(),
    container,
  };
  const provider = new ApprovalExampleProvider(app);
  provider.register();
  await provider.start();
  try {
    const service = container.resolve(approvalExampleServiceToken);
    const created = await service.create(
      'leave',
      { days: 2, reason: 'Family' },
      'zhang',
    );
    const id = Number(created.id);
    await service.runtime.fire('scenarioLeaves', id, 'submit', {
      actor: { id: 'zhang' },
    });
    const [task] = await service.approvals.tasksFor('scenarioLeaves', id);
    await service.taskAction(task.id, 'respond', { answer: 'approve' }, 'li');
    const view = await eventually(
      () => service.runtime.view('scenarioLeaves', id, { id: 'zhang' }),
      (current) => current.state === 'registered',
    );
    expect(view.record.registrationRef).toBe(
      `leave-registration:${created.id}`,
    );
  } finally {
    await provider.shutdown();
    await jobs.shutdown();
  }
});
