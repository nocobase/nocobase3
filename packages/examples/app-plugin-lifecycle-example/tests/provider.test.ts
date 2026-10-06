// The real Provider against SQLite and the memory jobs service: effects run
// as jobs, and a restart picks up what the previous start left queued.
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
import { CREATE_TRANSITION } from '@nocobase/lifecycle';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LifecycleExampleProvider } from '../server/providers/lifecycle-example.js';
import { lifecycleExampleServiceToken } from '../server/tokens.js';

const root = path.resolve(import.meta.dirname, '..');
let directory: string;
let database: DatabaseManager;

const logger = { info: () => {}, warn: () => {}, error: () => {} };

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'lifecycle-example-'));
  database = createDatabaseManager({
    drivers: { sqlite },
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(directory, 'main.sqlite'),
      },
    },
  });
  await database
    .createMigrator({
      directory: path.join(root, 'database/migrations'),
      packageName: '@nocobase/app-plugin-lifecycle-example',
    })
    .latest();
});

afterEach(async () => {
  await database.destroy();
  await rm(directory, { recursive: true, force: true });
});

async function start(): Promise<{
  provider: LifecycleExampleProvider;
  stop: () => Promise<void>;
  container: ServiceContainer;
}> {
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
  const provider = new LifecycleExampleProvider(app);
  provider.register();
  await provider.start();
  return {
    provider,
    container,
    stop: async () => {
      await provider.shutdown();
      await jobs.shutdown();
    },
  };
}

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

describe('lifecycle example provider', () => {
  it('runs an approval end to end, paying the expense on the jobs service', async () => {
    const { container, stop } = await start();
    try {
      const service = container.resolve(lifecycleExampleServiceToken);
      const expense = await service.createExpense(
        {
          title: '上海客户拜访',
          purpose: '季度回访',
          items: [
            {
              date: '2026-09-28',
              category: 'transport',
              description: '机票',
              amountCents: 800_000,
            },
          ],
          failPayments: 0,
        },
        'lin',
      );
      const id = String(expense.id);
      await service.runtime.fire('expenses', id, 'submit', {
        actor: { id: 'lin' },
        input: {},
      });
      const waiting = await service.listExpenses('chen', 'approvals', {
        page: 1,
        pageSize: 20,
      });
      expect(waiting.records.map((record) => record.id)).toEqual([expense.id]);
      expect(waiting.total).toBe(1);
      await service.runtime.fire('expenses', id, 'requestInfo', {
        actor: { id: 'chen' },
        input: { reason: '请补充行程单' },
      });
      // Sent back, it is with the applicant and leaves the approver's queue.
      expect(
        await service.listExpenses('chen', 'approvals', {
          page: 1,
          pageSize: 20,
        }),
      ).toEqual({ records: [], total: 0 });
      await service.runtime.fire('expenses', id, 'resubmit', {
        actor: { id: 'lin' },
        input: {},
      });
      await service.runtime.fire('expenses', id, 'approve', {
        actor: { id: 'chen' },
        input: { comment: '同意' },
      });
      const detail = await eventually(
        () => service.runtime.view('expenses', id, { id: 'lin' }),
        (value) => value.record.status === 'paid',
      );
      expect(
        detail.history.transitions.map((entry) => entry.transition),
      ).toEqual([
        CREATE_TRANSITION,
        'submit',
        'requestInfo',
        'resubmit',
        'approve',
        'paid',
      ]);
      expect(
        detail.history.effectRuns.every((run) => run.status === 'succeeded'),
      ).toBe(true);
      // The payment effect's reference reached the record through the 'paid' transition.
      expect(detail.record.paymentRef).toMatch(/^PAY\d{12}$/);
    } finally {
      await stop();
    }
  });

  it('closes an idle ticket when the triggers are swept', async () => {
    const { container, stop } = await start();
    try {
      const service = container.resolve(lifecycleExampleServiceToken);
      const ticket = await service.createTicket(
        {
          subject: '无法登录后台',
          category: 'account',
          priority: 'high',
          description: '提示会话过期',
          failNotifications: 0,
        },
        'customer-li',
      );
      const id = String(ticket.id);
      await service.runtime.fire('tickets', id, 'reply', {
        actor: { id: 'agent-zhou' },
        input: { message: '请清除缓存后重试' },
      });
      // Pretend the wait has passed instead of waiting two minutes.
      await database.repository('lifecycleExampleTickets').updateMany({
        filter: { id: Number(id) },
        values: { statusChangedAt: '2000-01-01T00:00:00.000Z' },
      });
      expect(await service.runTriggers()).toBe(1);
      const detail = await service.runtime.view('tickets', id, {
        id: 'agent-zhou',
      });
      expect(detail.record).toMatchObject({
        status: 'closed',
        closedReason: 'timeout',
      });
    } finally {
      await stop();
    }
  });
});
