import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CREATE_TRANSITION,
  createRepositoryLifecycleStore,
  defineLifecycle,
  LIFECYCLE_COLLECTIONS,
  LifecycleRuntime,
  type EffectDispatcher,
  type LifecycleStore,
} from '../src/index.js';
import { ticketLifecycle, type TicketTypes } from './fixtures/ticket.js';

let database: DatabaseManager;
let directory: string;
let store: LifecycleStore;
let now: Date;
let sent: string[];

async function createTables(): Promise<void> {
  const builder = database.builder();
  await builder.createCollection('tickets', (table) => {
    table.bigInt('id').primary().autoIncrement().notNull();
    table.string('customerEmail').notNull();
    table.string('status').notNull();
    table.datetimeTz('statusChangedAt').notNull();
    table.integer('lifecycleVersion').notNull().defaultTo(0);
  });
  await builder.createCollection('notes', (table) => {
    table.bigInt('id').primary().autoIncrement().notNull();
    table.string('ticketId').notNull();
    table.string('text').notNull();
  });
  await builder.createCollection(LIFECYCLE_COLLECTIONS.transitions, (table) => {
    table.bigInt('id').primary().autoIncrement().notNull();
    table.string('lifecycle').notNull();
    table.string('recordId').notNull();
    table.string('transition').notNull();
    // Null on the entry runtime.create() writes.
    table.string('from');
    table.string('to').notNull();
    table.string('actorId').notNull();
    table.json('input').notNull().defaultTo({});
    table.datetimeTz('at').notNull();
    table.integer('version').notNull();
    table.string('requestId');
    table.unique(['lifecycle', 'recordId', 'version']);
    table.unique(['lifecycle', 'recordId', 'requestId']);
  });
  await builder.createCollection(LIFECYCLE_COLLECTIONS.effectRuns, (table) => {
    table.bigInt('id').primary().autoIncrement().notNull();
    table.bigInt('transitionId').notNull();
    table.string('lifecycle').notNull();
    table.string('recordId').notNull();
    table.string('effect').notNull();
    table.string('status').notNull();
    table.integer('attempts').notNull().defaultTo(0);
    table.integer('maxAttempts').notNull().defaultTo(1);
    table.json('result');
    table.text('error');
    table.datetimeTz('createdAt').notNull();
    table.datetimeTz('updatedAt').notNull();
    table.datetimeTz('claimedAt');
    table.datetimeTz('runAfter');
  });
}

function runtime(dispatcher?: EffectDispatcher): LifecycleRuntime {
  const created = new LifecycleRuntime({
    store,
    clock: () => now,
    ...(dispatcher ? { dispatcher } : {}),
  });
  created.register(ticketLifecycle, {
    services: { mail: { send: (to) => void sent.push(to) } },
  });
  return created;
}

async function createTicket(): Promise<string> {
  const created = await database.repository('tickets').createOne({
    values: {
      customerEmail: 'a@example.com',
      status: 'open',
      statusChangedAt: now.toISOString(),
    },
  });
  return String(created.record.id);
}

beforeEach(async () => {
  // A file, not :memory:, so the pool behaves as it does in an application.
  directory = await mkdtemp(path.join(os.tmpdir(), 'lifecycle-store-'));
  database = createDatabaseManager({
    drivers: { sqlite },
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(directory, 'main.sqlite'),
      },
    },
  });
  await createTables();
  store = createRepositoryLifecycleStore(database);
  now = new Date('2026-10-01T09:00:00.000Z');
  sent = [];
});

afterEach(async () => {
  await database.destroy();
  await rm(directory, { recursive: true, force: true });
});

describe('Repository lifecycle store', () => {
  it('writes the state, the log entry and the effect runs together', async () => {
    const id = await createTicket();
    const result = await runtime().fire('tickets', id, 'replyToCustomer', {
      actor: { id: 'agent' },
      input: { message: 'Please confirm' },
    });
    expect(result.record).toMatchObject({ status: 'awaitingCustomer' });
    expect(sent).toEqual(['a@example.com']);
    const history = await runtime().history('tickets', id);
    expect(history.transitions).toMatchObject([
      {
        transition: 'replyToCustomer',
        from: 'open',
        to: 'awaitingCustomer',
        actorId: 'agent',
        input: { message: 'Please confirm' },
        at: '2026-10-01T09:00:00.000Z',
      },
    ]);
    expect(history.effectRuns).toMatchObject([
      { status: 'succeeded', attempts: 1, result: { sentTo: 'a@example.com' } },
    ]);
  });

  it('rolls back the state when the transaction fails', async () => {
    const id = await createTicket();
    await expect(
      runtime().fire('tickets', id, 'replyToCustomer', {
        actor: { id: 'agent' },
        input: {},
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const ticket = await database.repository('tickets').findOne({
      filter: { id: Number(id) },
    });
    expect(ticket?.status).toBe('open');
    expect((await runtime().history('tickets', id)).transitions).toEqual([]);
  });

  it('lets only one of two concurrent transitions through', async () => {
    const id = await createTicket();
    const results = await Promise.allSettled([
      runtime().fire('tickets', id, 'close', { actor: { id: 'agent' } }),
      runtime().fire('tickets', id, 'close', { actor: { id: 'agent' } }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect((await runtime().history('tickets', id)).transitions).toHaveLength(
      1,
    );
  });

  it('finds idle records with a query and closes them', async () => {
    const id = await createTicket();
    await runtime().fire('tickets', id, 'replyToCustomer', {
      actor: { id: 'agent' },
      input: { message: 'Please confirm' },
    });
    now = new Date(now.getTime() + 71 * 3_600_000);
    expect(await runtime().runTriggers()).toBe(0);
    now = new Date(now.getTime() + 2 * 3_600_000);
    expect(await runtime().runTriggers()).toBe(1);
    const ticket = await database.repository('tickets').findOne({
      filter: { id: Number(id) },
    });
    expect(ticket?.status).toBe('closed');
  });

  it('pages idle records by the time they changed and then by id', async () => {
    const ids: string[] = [];
    for (let index = 0; index < 5; index += 1) ids.push(await createTicket());
    // Two tickets share an instant, so the page boundary falls inside a tie.
    await database.repository('tickets').updateMany({
      filter: { id: Number(ids[0]) },
      values: { statusChangedAt: '2026-10-01T08:00:00.000Z' },
    });
    await database.repository('tickets').updateMany({
      filter: { id: Number(ids[4]) },
      values: { statusChangedAt: '2026-10-01T08:30:00.000Z' },
    });
    const query = {
      stateField: 'status',
      states: ['open'],
      changedAtField: 'statusChangedAt',
      changedBefore: '2026-10-01T10:00:00.000Z',
      limit: 2,
    };
    const first = await store.findIdleRecords('tickets', query);
    expect(first.map((record) => String(record.id))).toEqual([ids[0], ids[4]]);
    const second = await store.findIdleRecords('tickets', {
      ...query,
      after: {
        changedAt: String(first[1]!.statusChangedAt),
        id: first[1]!.id,
      },
    });
    expect(second.map((record) => String(record.id))).toEqual([ids[1], ids[2]]);
    const third = await store.findIdleRecords('tickets', {
      ...query,
      after: {
        changedAt: String(second[1]!.statusChangedAt),
        id: second[1]!.id,
      },
    });
    expect(third.map((record) => String(record.id))).toEqual([ids[3]]);
  });

  it('runs an effect a crashed process left behind once it recovers', async () => {
    const id = await createTicket();
    // A dispatcher that accepts the run and then "crashes" before executing it.
    const lost: string[] = [];
    await runtime({
      dispatch: (runId) => {
        lost.push(runId);
        return Promise.resolve();
      },
    }).fire('tickets', id, 'replyToCustomer', {
      actor: { id: 'agent' },
      input: { message: 'Please confirm' },
    });
    expect(lost).toHaveLength(1);
    expect(sent).toEqual([]);

    // The next process starts and recovers what is still queued.
    expect(await runtime().recover()).toBe(1);
    expect(sent).toEqual(['a@example.com']);
    expect((await runtime().history('tickets', id)).effectRuns).toMatchObject([
      { status: 'succeeded' },
    ]);
  });

  it('hands guards the transaction, so they can read the database', async () => {
    interface GuardedTypes {
      record: TicketTypes['record'];
      state: TicketTypes['state'];
      services: { count(collection: string): Promise<number> };
    }
    const id = await createTicket();
    const guarded = new LifecycleRuntime({ store, clock: () => now });
    guarded.register(
      defineLifecycle<GuardedTypes>({
        name: 'guardedTickets',
        collection: 'tickets',
        initial: 'open',
        states: ['open', { name: 'closed', final: true }],
        transitions: {
          close: {
            from: 'open',
            to: 'closed',
            // Reads through the transaction: a read on the database manager
            // would wait for SQLite's only connection forever.
            guard: async ({ services }) =>
              (await services.count('tickets')) > 0,
          },
        },
      }),
      {
        services: (handle) => ({
          count: (collection) =>
            (
              (handle as DatabaseConnection | undefined) ??
              database.connection()
            )
              .repository(collection)
              .count(),
        }),
      },
    );
    const result = await guarded.fire('guardedTickets', id, 'close', {
      actor: { id: 'agent' },
    });
    expect(result.record).toMatchObject({ status: 'closed' });
  });

  it('commits what onTransition writes with the state, and rolls it back with it', async () => {
    interface NotedTypes {
      record: TicketTypes['record'];
      state: TicketTypes['state'];
    }
    const id = await createTicket();
    const noted = new LifecycleRuntime({ store, clock: () => now });
    noted.register(
      defineLifecycle<NotedTypes>({
        name: 'notedTickets',
        collection: 'tickets',
        initial: 'open',
        states: ['open', 'awaitingCustomer', { name: 'closed', final: true }],
        transitions: {
          wait: {
            from: 'open',
            to: 'awaitingCustomer',
            onTransition: async ({ record, transactionHandle }) => {
              await (transactionHandle as DatabaseConnection)
                .repository('notes')
                .createOne({
                  values: { ticketId: String(record.id), text: 'waiting' },
                });
            },
          },
          close: {
            from: 'awaitingCustomer',
            to: 'closed',
            onTransition: async ({ record, transactionHandle }) => {
              await (transactionHandle as DatabaseConnection)
                .repository('notes')
                .createOne({
                  values: { ticketId: String(record.id), text: 'closing' },
                });
              throw new Error('Closing is not allowed today.');
            },
          },
        },
      }),
    );
    await noted.fire('notedTickets', id, 'wait', { actor: { id: 'agent' } });
    await expect(
      noted.fire('notedTickets', id, 'close', { actor: { id: 'agent' } }),
    ).rejects.toThrow('Closing is not allowed today.');
    expect(
      (await database.repository('notes').findMany({})).map((row) => row.text),
    ).toEqual(['waiting']);
    expect(
      await database
        .repository('tickets')
        .findOne({ filter: { id: Number(id) } }),
    ).toMatchObject({ status: 'awaitingCustomer' });
  });

  it('writes a record only at the version it was read at', async () => {
    const id = await createTicket();
    const condition = {
      stateField: 'status',
      state: 'open',
      versionField: 'lifecycleVersion',
    };
    expect(
      await store.updateRecordIf(
        'tickets',
        id,
        { ...condition, version: 0 },
        {
          lifecycleVersion: 1,
        },
      ),
    ).toBe(true);
    // Same state, older version: the second writer loses.
    expect(
      await store.updateRecordIf(
        'tickets',
        id,
        { ...condition, version: 0 },
        {
          lifecycleVersion: 1,
        },
      ),
    ).toBe(false);
    const result = await runtime().fire('tickets', id, 'replyToCustomer', {
      actor: { id: 'agent' },
      input: { message: 'Please confirm' },
    });
    expect(result.record).toMatchObject({ lifecycleVersion: 2 });
    expect(result.entry.version).toBe(2);
    expect((await runtime().history('tickets', id)).transitions).toMatchObject([
      { version: 2 },
    ]);
  });

  it('creates a record through the lifecycle, its history starting there', async () => {
    const created = await runtime().create(
      'tickets',
      { customerEmail: 'b@example.com' },
      { actor: { id: 'customer' } },
    );
    expect(created.record).toMatchObject({
      customerEmail: 'b@example.com',
      status: 'open',
      lifecycleVersion: 1,
    });
    const id = String(created.record.id);
    expect((await runtime().history('tickets', id)).transitions).toMatchObject([
      { transition: CREATE_TRANSITION, from: null, to: 'open', version: 1 },
    ]);
    await runtime().fire('tickets', id, 'replyToCustomer', {
      actor: { id: 'agent' },
      input: { message: 'Hello' },
    });
    expect(
      (await runtime().history('tickets', id)).transitions.map(
        (entry) => entry.version,
      ),
    ).toEqual([1, 2]);
  });

  it('replays a repeated request and prunes finished runs on the database', async () => {
    const id = await createTicket();
    const options = {
      actor: { id: 'agent' },
      input: { message: 'Please confirm' },
      requestId: 'reply-1',
    };
    await runtime().fire('tickets', id, 'replyToCustomer', options);
    const again = await runtime().fire(
      'tickets',
      id,
      'replyToCustomer',
      options,
    );
    expect(again.replayed).toBe(true);
    expect(sent).toEqual(['a@example.com']);
    const history = await runtime().history('tickets', id);
    expect(history.transitions).toMatchObject([{ requestId: 'reply-1' }]);
    expect(history.effectRuns).toMatchObject([{ status: 'succeeded' }]);
    now = new Date(now.getTime() + 60_000);
    expect(await runtime().prune({ olderThan: now })).toBe(1);
    expect((await runtime().history('tickets', id)).effectRuns).toEqual([]);
  });

  it('takes back an attempt whose process stopped answering', async () => {
    const id = await createTicket();
    await runtime({ dispatch: () => Promise.resolve() }).fire(
      'tickets',
      id,
      'replyToCustomer',
      { actor: { id: 'agent' }, input: { message: 'Please confirm' } },
    );
    const [run] = (await runtime().history('tickets', id)).effectRuns;
    await store.updateEffectRun(
      run!.id,
      { status: 'queued' },
      {
        status: 'running',
        attempts: 1,
        claimedAt: now.toISOString(),
      },
    );
    now = new Date(now.getTime() + 10 * 60_000);
    await runtime().recover();
    expect((await runtime().history('tickets', id)).effectRuns).toMatchObject([
      { status: 'succeeded', attempts: 2 },
    ]);
  });
});
