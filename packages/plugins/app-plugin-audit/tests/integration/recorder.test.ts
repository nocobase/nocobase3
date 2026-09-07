import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '@nocobase/db';
import { bindAuditRecorder } from '@nocobase/app-plugin-audit/server';
import { handle } from '../helpers/database-fixtures.js';
import {
  createFixture,
  type Fixture,
  type RawClient,
} from './sqlite-fixture.js';

const event = { action: 'synthetic.updated', outcome: 'success' as const };
describe('public bound Recorder', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await createFixture();
  });
  afterEach(async () => {
    await f?.cleanup();
  });

  it('returns pending for idempotent repeats inside one transaction and commits a single event', async () => {
    let id = '';
    await f.connection.transaction(async (connection) => {
      const options = {
        transaction: handle(connection),
        idempotencyKey: 'same-transaction',
      };
      const first = await f.recorder.record(event, options);
      expect(first.state).toBe('pending-commit');
      expect(await f.recorder.record(event, options)).toEqual(first);
      if (first.state === 'pending-commit') id = first.eventId;
    });
    expect(await f.store.findById(f.scope, id)).toMatchObject(event);
    expect(
      (await f.store.query(f.scope, { store: 'main' })).items,
    ).toHaveLength(1);
  });

  it('rejects foreign, copied and accessor transaction handles without invoking getters', async () => {
    const other = await createFixture();
    try {
      await other.connection.transaction(async (connection) => {
        await expect(
          f.recorder.record(event, { transaction: handle(connection) }),
        ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
      });
      await f.connection.transaction(async (connection) => {
        const real = handle(connection);
        await expect(
          f.recorder.record(event, { transaction: { ...real } }),
        ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
        let reads = 0;
        const forged = {
          ...real,
          get connection(): DatabaseConnection {
            reads++;
            throw new Error('SYNTHETIC_SECRET');
          },
        };
        await expect(
          f.recorder.record(event, { transaction: forged }),
        ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
        expect(reads).toBe(0);
      });
    } finally {
      await other.cleanup();
    }
  });

  it('marks all ancestors rollback-only after a real SQLite write failure caught by every callback', async () => {
    const client = await f.connection.client<RawClient>();
    await client.raw(
      'CREATE TABLE synthetic_business (id INTEGER PRIMARY KEY)',
    );
    await client.raw(
      `CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON auditEvents BEGIN SELECT RAISE(ABORT, 'SYNTHETIC_SQL_SECRET'); END`,
    );
    let callbacks = 0;
    await expect(
      f.connection.transaction(async (outer) => {
        callbacks++;
        await outer.query
          .insertInto('synthetic_business')
          .values({ id: 1 })
          .execute();
        await expect(
          outer.transaction(async (inner) => {
            callbacks++;
            await inner.query
              .insertInto('synthetic_business')
              .values({ id: 2 })
              .execute();
            await expect(
              f.recorder.record(event, { transaction: handle(inner) }),
            ).rejects.toMatchObject({
              code: 'AUDIT_WRITE_FAILED',
              message: 'AUDIT_WRITE_FAILED',
            });
            return 'caught';
          }),
        ).rejects.toThrow('rollback-only');
        await outer.query
          .insertInto('synthetic_business')
          .values({ id: 3 })
          .execute();
        return 'caught again';
      }),
    ).rejects.toThrow('rollback-only');
    expect(callbacks).toBe(2);
    expect(await client.raw('SELECT * FROM synthetic_business')).toEqual([]);
    expect(await client.raw('SELECT * FROM auditEvents')).toEqual([]);
  });

  it('rolls back business writes when invalid payload or an idempotency conflict is caught', async () => {
    const client = await f.connection.client<RawClient>();
    await client.raw(
      'CREATE TABLE synthetic_business (id INTEGER PRIMARY KEY)',
    );
    await f.recorder.record(event, { idempotencyKey: 'conflict' });
    for (const invalid of [false, true]) {
      await expect(
        f.connection.transaction(async (connection) => {
          await connection.query
            .insertInto('synthetic_business')
            .values({ id: 1 })
            .execute();
          await expect(
            f.recorder.record(
              {
                ...event,
                outcome: 'failed',
                ...(invalid ? { details: { value: Infinity } } : {}),
              },
              { transaction: handle(connection), idempotencyKey: 'conflict' },
            ),
          ).rejects.toMatchObject({
            code: invalid
              ? 'AUDIT_INVALID_EVENT'
              : 'AUDIT_IDEMPOTENCY_CONFLICT',
          });
        }),
      ).rejects.toThrow('rollback-only');
    }
    expect(await client.raw('SELECT * FROM synthetic_business')).toEqual([]);
    expect(
      (await f.store.query(f.scope, { store: 'main' })).items,
    ).toHaveLength(1);
  });

  it('reads policy changes and returns disabled/excluded without persisting an event', async () => {
    f.policy = { ...f.policy, enabled: false };
    expect(await f.recorder.record(event)).toEqual({
      state: 'disabled',
      reason: 'audit-disabled',
    });
    f.policy = { ...f.policy, enabled: true, excluded: true, revision: 11 };
    expect(await f.recorder.record(event)).toEqual({
      state: 'excluded',
      reason: 'producer-excluded',
      policyVersion: 11,
    });
    expect(
      (await f.store.query(f.scope, { store: 'main' })).items,
    ).toHaveLength(0);
  });

  it('captures trusted identity at bind and rejects ordinary overrides without calling a getter', async () => {
    const scope = { ...f.scope, actor: { type: 'user', id: 'original-user' } };
    const recorder = bindAuditRecorder(scope, {
      producer: 'bound-runtime',
      store: f.store,
      policy: () => Promise.resolve(f.policy),
    });
    scope.actor.id = 'mutated';
    const receipt = await recorder.record(event);
    if (receipt.state !== 'committed') throw new Error('Expected committed.');
    expect(await f.store.findById(f.scope, receipt.eventId)).toMatchObject({
      actor: { id: 'original-user' },
    });
    let reads = 0;
    await expect(
      recorder.record({
        ...event,
        get details(): never {
          reads++;
          throw new Error('SYNTHETIC_SECRET');
        },
      }),
    ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
    expect(reads).toBe(0);
  });
  it('never returns committed when a deferred constraint fails at the actual commit boundary', async () => {
    const client = await f.connection.client<RawClient>();
    await client.raw('PRAGMA foreign_keys = ON');
    await client.raw('CREATE TABLE synthetic_parent (id INTEGER PRIMARY KEY)');
    await client.raw(
      'CREATE TABLE synthetic_child (id INTEGER REFERENCES synthetic_parent(id) DEFERRABLE INITIALLY DEFERRED)',
    );
    await client.raw(
      'CREATE TRIGGER synthetic_deferred_failure AFTER INSERT ON auditEvents BEGIN INSERT INTO synthetic_child VALUES (42); END',
    );
    await expect(f.recorder.record(event)).rejects.toMatchObject({
      code: 'AUDIT_WRITE_FAILED',
    });
    expect(await client.raw('SELECT * FROM auditEvents')).toEqual([]);
    expect(await client.raw('SELECT * FROM synthetic_child')).toEqual([]);
    await f.connection.transaction(async (connection) => {
      await connection.query
        .insertInto('synthetic_parent')
        .values({ id: 42 })
        .execute();
    });
    expect(await client.raw('SELECT * FROM auditEvents')).toEqual([]);
    expect(await client.raw('SELECT * FROM synthetic_child')).toEqual([]);
    expect(await client.raw('SELECT * FROM synthetic_parent')).toEqual([
      { id: 42 },
    ]);
  });

  it('uses the captured policy payload limit without an accidental second default cap', async () => {
    f.policy = { ...f.policy, maxDetailsBytes: 100000 };
    const receipt = await f.recorder.record({
      ...event,
      details: { text: 'x'.repeat(70000) },
    });
    expect(receipt.state).toBe('committed');
    f.policy = { ...f.policy, maxDetailsBytes: 100 };
    await expect(
      f.recorder.record({ ...event, details: { text: 'x'.repeat(101) } }),
    ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
  });
});
