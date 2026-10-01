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
  });
  await builder.createCollection(LIFECYCLE_COLLECTIONS.transitions, (table) => {
    table.bigInt('id').primary().autoIncrement().notNull();
    table.string('lifecycle').notNull();
    table.string('recordId').notNull();
    table.string('transition').notNull();
    table.string('from').notNull();
    table.string('to').notNull();
    table.string('actorId').notNull();
    table.json('input').notNull().defaultTo({});
    table.datetimeTz('at').notNull();
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
        states: ['open', 'awaitingCustomer', 'closed'],
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

  it('takes back an attempt whose process stopped answering', async () => {
    const id = await createTicket();
    await runtime({ dispatch: () => Promise.resolve() }).fire(
      'tickets',
      id,
      'replyToCustomer',
      { actor: { id: 'agent' }, input: { message: 'Please confirm' } },
    );
    const [run] = (await runtime().history('tickets', id)).effectRuns;
    await store.updateEffectRun(run!.id, 'queued', {
      status: 'running',
      attempts: 1,
      claimedAt: now.toISOString(),
    });
    now = new Date(now.getTime() + 10 * 60_000);
    await runtime().recover();
    expect((await runtime().history('tickets', id)).effectRuns).toMatchObject([
      { status: 'succeeded', attempts: 2 },
    ]);
  });
});
