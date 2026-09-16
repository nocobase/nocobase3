import type { Adapter } from '@boringnode/queue/types';
import { createDatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import type { Knex } from 'knex';
import { expect, it, vi } from 'vitest';

import { createQueueManager } from '@nocobase/queue';
import migration from '../database/migrations/202609020001_scheduler_create_definitions.js';

it('reads SQLite schedule dates for reads and claims without extra queries', async () => {
  const database = createDatabaseManager({
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  const connection = await database.connect();
  const client = await connection.client<Knex>();
  await migration.up({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
  const queue = createQueueManager(
    {
      default: 'database',
      connections: {
        database: { driver: 'database', schedulesTable: 'queue_schedules' },
      },
      jobs: { autoLoad: false, locations: [] },
    },
    { database },
  );
  const now = new Date('2026-09-16T00:00:00.123Z');
  const due = new Date(now.getTime() - 1000);
  const end = new Date(now.getTime() + 500);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  const onQuery = vi.fn();
  client.on('query', onQuery);
  try {
    await queue.init();
    const store = queue.schedules();
    await store.upsert({
      id: 'dates',
      name: 'DateJob',
      payload: {},
      everyMs: 1000,
      timezone: 'UTC',
      from: due,
      to: end,
    });
    await store.update('dates', { nextRunAt: due, lastRunAt: due });
    const raw = (await client('queue_schedules').first()) as Record<
      string,
      unknown
    >;
    expect(raw.next_run_at).toBe(due.getTime());
    onQuery.mockClear();
    const expected = {
      from: due,
      to: end,
      nextRunAt: due,
      lastRunAt: due,
      createdAt: new Date(raw.created_at as string),
    };
    expect(await store.get('dates')).toMatchObject(expected);
    expect(onQuery).toHaveBeenCalledTimes(1);
    onQuery.mockClear();
    expect(await store.list()).toMatchObject([expected]);
    expect(onQuery).toHaveBeenCalledTimes(1);
    client.removeListener('query', onQuery);
    const adapter = queue.use() as Adapter;
    expect(await adapter.claimDueSchedule()).toMatchObject(expected);
    // The next interval exceeds the end date and must not be scheduled.
    expect(await store.get('dates')).toMatchObject({
      nextRunAt: null,
      lastRunAt: now,
      runCount: 1,
    });
    expect(
      ((await client('queue_schedules').first()) as Record<string, unknown>)
        .created_at,
    ).toBe(raw.created_at);
  } finally {
    vi.useRealTimers();
    await queue.close();
    await database.destroy();
  }
});
