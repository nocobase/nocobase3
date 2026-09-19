import { QueueSchemaService } from '@boringnode/queue';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import type { Knex } from 'knex';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createDatabaseQueueAdapterFactory } from '../src/index.js';
import type { AdapterFactory } from '@boringnode/queue/types';

let database: DatabaseManager;
let client: Knex;
let adapter: ReturnType<AdapterFactory>;

beforeEach(async () => {
  database = createDatabaseManager({
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  client = await database.connection().client<Knex>();
  await new QueueSchemaService(client).createSchedulesTable('custom_schedules');
  const factory = await createDatabaseQueueAdapterFactory({
    connection: database.connection(),
    schedulesTableName: 'custom_schedules',
  });
  adapter = factory();
});

afterEach(async () => database.destroy());

it('updates definitions without resetting schedule history', async () => {
  const config = {
    name: 'ExampleJob',
    payload: { value: 1 },
    cronExpression: '0 * * * *',
    timezone: 'UTC',
  };
  const id = await adapter.upsertSchedule(config);
  const lastRunAt = new Date('2026-09-01T00:00:00Z');
  const nextRunAt = new Date('2026-09-02T00:00:00Z');
  await adapter.updateSchedule(id, {
    runCount: 7,
    lastRunAt,
    nextRunAt,
    status: 'paused',
  });
  const before = await adapter.getSchedule(id);
  expect(
    await adapter.upsertSchedule({ ...config, id, payload: { value: 2 } }),
  ).toBe(id);
  expect(await adapter.getSchedule(id)).toMatchObject({
    payload: { value: 2 },
    runCount: 7,
    lastRunAt,
    nextRunAt,
    status: 'active',
    createdAt: before?.createdAt,
  });
  expect(await adapter.listSchedules()).toHaveLength(1);
});

it('propagates insert failures without leaving a partial schedule', async () => {
  await client.raw(`CREATE TRIGGER reject_schedule BEFORE INSERT ON custom_schedules
    BEGIN SELECT RAISE(FAIL, 'schedule rejected'); END`);
  await expect(
    adapter.upsertSchedule({
      id: 'rejected',
      name: 'ExampleJob',
      payload: {},
      everyMs: 1000,
      timezone: 'UTC',
    }),
  ).rejects.toThrow('schedule rejected');
  expect(await adapter.listSchedules()).toEqual([]);
});

it('leaves the supplied connection usable when the adapter is destroyed', async () => {
  await adapter.destroy();
  expect(await adapter.listSchedules()).toEqual([]);
});
