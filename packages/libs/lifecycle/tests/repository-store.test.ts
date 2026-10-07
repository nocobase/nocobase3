import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import { createTestDatabase, type TestDatabase } from '@nocobase/db-testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CREATE_TRANSITION,
  createRepositoryLifecycleStore,
  defineEffect,
  defineLifecycle,
  LIFECYCLE_COLLECTIONS,
  LifecycleRuntime,
  type EffectDispatcher,
  type LifecycleStore,
  SYSTEM_ACTOR,
} from '../src/index.js';
import { ticketLifecycle, type TicketTypes } from './fixtures/ticket.js';

let testDatabase: TestDatabase;
let database: DatabaseManager;
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
    // The request id, or `$v:<version>` without one: never null, so one
    // unique index means the same on every dialect.
    table.string('requestKey').notNull();
    table.unique(['lifecycle', 'recordId', 'version']);
    table.unique(['lifecycle', 'recordId', 'requestKey']);
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
    // A continuation waiting to be tried again, and when it was last refused:
    // null exactly when nothing is pending, so the sweep finds the pending ones.
    table.json('continuation');
    table.datetimeTz('continuationFailedAt');
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
  // Whichever dialect the environment selects, SQLite by default.
  testDatabase = await createTestDatabase();
  database = testDatabase.database;
  await createTables();
  store = createRepositoryLifecycleStore(database);
  now = new Date('2026-10-01T09:00:00.000Z');
  sent = [];
});

afterEach(async () => {
  await testDatabase.destroy();
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

  it('joins a caller’s transaction, and dispatches the effects once it commits', async () => {
    const lifecycle = runtime();
    const id = await database.transaction(async (tx) => {
      const { record } = await lifecycle.create(
        'tickets',
        { customerEmail: 'a@example.com' },
        { actor: { id: 'agent' }, transaction: tx },
      );
      const result = await lifecycle.fire(
        'tickets',
        record.id,
        'replyToCustomer',
        {
          actor: { id: 'agent' },
          input: { message: 'Please confirm' },
          transaction: tx,
        },
      );
      expect(result.effectRuns).toMatchObject([{ status: 'queued' }]);
      expect(sent).toEqual([]);
      return String(record.id);
    });
    expect(sent).toEqual(['a@example.com']);
    expect(
      (await lifecycle.history('tickets', id)).transitions.map(
        (entry) => entry.transition,
      ),
    ).toEqual([CREATE_TRANSITION, 'replyToCustomer']);
  });

  it('rolls back with the caller’s transaction, and dispatches nothing', async () => {
    const lifecycle = runtime();
    const id = await createTicket();
    await expect(
      database.transaction(async (tx) => {
        await lifecycle.fire('tickets', id, 'replyToCustomer', {
          actor: { id: 'agent' },
          input: { message: 'Please confirm' },
          transaction: tx,
        });
        throw new Error('The caller changes its mind.');
      }),
    ).rejects.toThrow('changes its mind');
    expect(
      await database
        .repository('tickets')
        .findOne({ filter: { id: Number(id) } }),
    ).toMatchObject({ status: 'open', lifecycleVersion: 0 });
    expect(await lifecycle.history('tickets', id)).toEqual({
      transitions: [],
      effectRuns: [],
    });
    expect(sent).toEqual([]);
  });

  it('undoes only a refused transition in a savepoint, when the caller catches it', async () => {
    interface NotedTypes {
      record: TicketTypes['record'];
      state: TicketTypes['state'];
    }
    const noted = new LifecycleRuntime({ store, clock: () => now });
    noted.register(
      defineLifecycle<NotedTypes>({
        name: 'notedTickets',
        collection: 'tickets',
        initial: 'open',
        states: ['open', { name: 'closed', final: true }],
        transitions: {
          close: {
            from: 'open',
            to: 'closed',
            // Writes, then refuses: the savepoint has something to undo.
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
    const id = await createTicket();
    await database.transaction(async (tx) => {
      await tx.repository('notes').createOne({
        values: { ticketId: id, text: 'asked to close' },
      });
      await expect(
        noted.fire('notedTickets', id, 'close', {
          actor: { id: 'agent' },
          transaction: tx,
        }),
      ).rejects.toThrow('Closing is not allowed today.');
    });
    expect(
      (await database.repository('notes').findMany({})).map((row) => row.text),
    ).toEqual(['asked to close']);
    expect(
      await database
        .repository('tickets')
        .findOne({ filter: { id: Number(id) } }),
    ).toMatchObject({ status: 'open' });
    expect((await noted.history('notedTickets', id)).transitions).toEqual([]);
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

  it('hands over a queued run whose dispatch was lost, on the database', async () => {
    const lost: string[] = [];
    const dispatcher: EffectDispatcher = {
      dispatch: (runId) => {
        lost.push(runId);
        return Promise.resolve();
      },
    };
    const id = await createTicket();
    await runtime(dispatcher).fire('tickets', id, 'replyToCustomer', {
      actor: { id: 'agent' },
      input: { message: 'Please confirm' },
    });
    expect(lost).toHaveLength(1);
    expect(await runtime(dispatcher).reclaim()).toBe(0);
    now = new Date(now.getTime() + 6 * 60_000);
    expect(await runtime(dispatcher).reclaim()).toBe(1);
    expect(lost).toEqual([lost[0], lost[0]]);
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

  it('runs state hooks and a transaction across records in one database transaction', async () => {
    interface NotedTypes {
      record: TicketTypes['record'];
      state: TicketTypes['state'];
    }
    const first = await createTicket();
    const second = await createTicket();
    const notes = (handle: unknown) =>
      (handle as DatabaseConnection).repository('notes');
    const hooked = new LifecycleRuntime({ store, clock: () => now });
    hooked.register(
      defineLifecycle<NotedTypes>({
        name: 'hookedTickets',
        collection: 'tickets',
        initial: 'open',
        states: ['open', 'awaitingCustomer', { name: 'closed', final: true }],
        transitions: {
          wait: { from: 'open', to: 'awaitingCustomer' },
          close: { from: 'awaitingCustomer', to: 'closed', manual: false },
        },
        onEnterState: {
          awaitingCustomer: async ({ record, tx }) => {
            await notes(tx.handle).createOne({
              values: { ticketId: String(record.id), text: 'waiting' },
            });
          },
        },
        onLeaveState: {
          awaitingCustomer: async ({ record, tx }) => {
            await notes(tx.handle).createOne({
              values: { ticketId: String(record.id), text: 'left' },
            });
          },
        },
      }),
    );
    await hooked.transaction(async (tx) => {
      await tx.fire('hookedTickets', first, 'wait', { actor: { id: 'agent' } });
      await tx.fire('hookedTickets', second, 'wait', {
        actor: { id: 'agent' },
      });
    });
    await expect(
      hooked.transaction(async (tx) => {
        await tx.fire('hookedTickets', first, 'close', {
          actor: { id: 'agent' },
        });
        await notes(tx.handle).createOne({
          values: { ticketId: first, text: 'closing note' },
        });
        // The second record has moved on since this page read it.
        await tx.fire('hookedTickets', second, 'close', {
          actor: { id: 'agent' },
          expect: { version: 0 },
        });
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(
      (await database.repository('notes').findMany({})).map(
        (row) => `${String(row.ticketId)}:${String(row.text)}`,
      ),
    ).toEqual([`${first}:waiting`, `${second}:waiting`]);
    expect(
      await database
        .repository('tickets')
        .findOne({ filter: { id: Number(first) } }),
    ).toMatchObject({ status: 'awaitingCustomer', lifecycleVersion: 1 });
  });
});

describe('a continuation waiting on the database', () => {
  interface Flags {
    broken: boolean;
  }
  interface DeliveryTypes {
    record: TicketTypes['record'];
    state: TicketTypes['state'];
    services: { readonly flags: Flags; readonly calls: string[] };
  }

  const deliver = defineEffect<DeliveryTypes>({
    name: 'deliveries.deliver',
    onSuccess: 'close',
    run: ({ services }) => {
      services.calls.push('deliver');
      return { trackingNumber: 'T-1' };
    },
  });

  const deliveries = defineLifecycle<DeliveryTypes>({
    name: 'deliveries',
    collection: 'tickets',
    initial: 'open',
    states: ['open', 'awaitingCustomer', { name: 'closed', final: true }],
    transitions: {
      ship: { from: 'open', to: 'awaitingCustomer', effects: [deliver] },
      close: {
        from: 'awaitingCustomer',
        to: 'closed',
        // A bug the next deploy fixes: it writes a field the lifecycle owns.
        set: ({ services }) =>
          services.flags.broken ? { status: 'closed' } : {},
      },
    },
  });

  it('keeps the outcome, waits, and fires once the definition is fixed', async () => {
    const id = await createTicket();
    const flags: Flags = { broken: true };
    const calls: string[] = [];
    const runtime = new LifecycleRuntime({ store, clock: () => now });
    runtime.register(deliveries, { services: { flags, calls } });

    const shipped = await runtime.fire('deliveries', id, 'ship', {
      actor: SYSTEM_ACTOR,
    });
    const runId = shipped.effectRuns[0].id;
    await expect(store.findEffectRun(runId)).resolves.toMatchObject({
      status: 'succeeded',
      result: { trackingNumber: 'T-1' },
      continuation: {
        transition: 'close',
        outcome: 'succeeded',
        input: { trackingNumber: 'T-1' },
        code: 'INVALID_SET',
        attempts: 1,
      },
    });
    await expect(
      runtime.listEffectRuns({ continuationPending: true }),
    ).resolves.toMatchObject([{ id: runId }]);
    await expect(
      runtime.listEffectRuns({ continuationPending: false }),
    ).resolves.toEqual([]);
    // Waiting, it is not pruned.
    await expect(
      runtime.prune({ olderThan: new Date(now.getTime() + 60_000) }),
    ).resolves.toBe(0);

    await expect(runtime.reclaim()).resolves.toBe(0);
    await expect(store.findEffectRun(runId)).resolves.toMatchObject({
      continuation: { attempts: 2 },
    });

    flags.broken = false;
    await expect(runtime.reclaim()).resolves.toBe(1);
    expect(
      await database
        .repository('tickets')
        .findOne({ filter: { id: Number(id) } }),
    ).toMatchObject({ status: 'closed', lifecycleVersion: 2 });
    await expect(store.findEffectRun(runId)).resolves.toMatchObject({
      status: 'succeeded',
      continuation: null,
    });
    await expect(
      runtime.listEffectRuns({ continuationPending: true }),
    ).resolves.toEqual([]);
    expect(calls).toEqual(['deliver']);
    expect(
      (await runtime.history('deliveries', id)).transitions.at(-1),
    ).toMatchObject({
      transition: 'close',
      requestId: `$run:${runId}:succeeded`,
    });
    await expect(runtime.continueRun(runId)).rejects.toMatchObject({
      code: 'NO_CONTINUATION',
    });
    await expect(
      runtime.prune({ olderThan: new Date(now.getTime() + 60_000) }),
    ).resolves.toBe(1);
  });
});

describe('the request key of a log entry', () => {
  const entry = {
    lifecycle: 'tickets',
    recordId: '1',
    transition: 'close',
    from: 'open',
    to: 'closed',
    actorId: 'agent',
    input: {},
    at: '2026-10-01T09:00:00.000Z',
  };

  it('logs every transition without a request id, each under its version', async () => {
    const id = await createTicket();
    // Two entries on one record with no request id: a unique index over a
    // nullable request id would count them as duplicates on some dialects.
    await runtime().fire('tickets', id, 'replyToCustomer', {
      actor: { id: 'agent' },
      input: { message: 'Please confirm' },
    });
    await runtime().fire('tickets', id, 'customerReplied', {
      actor: { id: 'customer' },
    });
    await runtime().fire('tickets', id, 'close', {
      actor: { id: 'agent' },
      requestId: 'close-1',
    });
    const rows = await database
      .repository(LIFECYCLE_COLLECTIONS.transitions)
      .findMany({ sort: (sort) => sort.field('version').asc() });
    expect(
      rows.map((row) => ({
        version: Number(row.version),
        requestId: row.requestId ?? null,
        requestKey: row.requestKey,
      })),
    ).toEqual([
      { version: 1, requestId: null, requestKey: '$v:1' },
      { version: 2, requestId: null, requestKey: '$v:2' },
      { version: 3, requestId: 'close-1', requestKey: 'close-1' },
    ]);
    expect(
      (await runtime().history('tickets', id)).transitions.map(
        (transition) => transition.requestId,
      ),
    ).toEqual([null, null, 'close-1']);
  });

  it('refuses a second entry under a request id already spent on the record', async () => {
    await store.appendTransition({ ...entry, version: 1, requestId: 'r-1' });
    await expect(
      store.appendTransition({ ...entry, version: 2, requestId: 'r-1' }),
    ).rejects.toThrow();
    // Another record may use the same key.
    await store.appendTransition({
      ...entry,
      recordId: '2',
      version: 1,
      requestId: 'r-1',
    });
    expect(
      await store.findTransitionByRequest('tickets', '1', 'r-1'),
    ).toMatchObject({ version: 1, requestId: 'r-1' });
    expect(
      await store.findTransitionByRequest('tickets', '1', '$v:1'),
    ).toBeUndefined();
  });
});

describe('joining a caller’s transaction', () => {
  async function ticketOf(id: string): Promise<unknown> {
    return database
      .repository('tickets')
      .findOne({ filter: { id: Number(id) } });
  }

  it('refuses the root connection instead of committing outside the caller’s transaction', async () => {
    const lifecycle = runtime();
    const id = await createTicket();
    await expect(
      database.transaction(async () => {
        await lifecycle.fire('tickets', id, 'replyToCustomer', {
          actor: { id: 'agent' },
          input: { message: 'Please confirm' },
          transaction: database.connection(),
        });
      }),
    ).rejects.toThrow(/itself is not a transaction/);
    expect(await ticketOf(id)).toMatchObject({ status: 'open' });
    expect((await lifecycle.history('tickets', id)).transitions).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('refuses a policy-bound root connection, which is no transaction either', async () => {
    const id = await createTicket();
    await expect(
      runtime().fire('tickets', id, 'replyToCustomer', {
        actor: { id: 'agent' },
        input: { message: 'Please confirm' },
        transaction: database.connection().withPolicies({}, null),
      }),
    ).rejects.toThrow(/not a transaction/);
    expect(await ticketOf(id)).toMatchObject({ status: 'open' });
  });

  it('refuses a transaction on another connection', async () => {
    const id = await createTicket();
    await expect(
      database.transaction(async (tx) => {
        // A transaction connection as another connection's would carry it.
        const elsewhere = Object.create(tx, {
          name: { value: 'reporting' },
        }) as DatabaseConnection;
        await runtime().fire('tickets', id, 'replyToCustomer', {
          actor: { id: 'agent' },
          input: { message: 'Please confirm' },
          transaction: elsewhere,
        });
      }),
    ).rejects.toThrow(/runs on connection "reporting"/);
    expect(await ticketOf(id)).toMatchObject({ status: 'open' });
  });

  it('refuses a transaction that has already committed', async () => {
    const id = await createTicket();
    let escaped: DatabaseConnection | undefined;
    await database.transaction((tx) => {
      escaped = tx;
      return Promise.resolve();
    });
    await expect(
      runtime().fire('tickets', id, 'replyToCustomer', {
        actor: { id: 'agent' },
        input: { message: 'Please confirm' },
        transaction: escaped,
      }),
    ).rejects.toThrow(/already complete/);
    expect(await ticketOf(id)).toMatchObject({ status: 'open' });
    expect(sent).toEqual([]);
  });
});
