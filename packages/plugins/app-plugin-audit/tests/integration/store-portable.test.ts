import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TransactionHandle } from '@nocobase/db';
import {
  PortableAuditStore,
  bindAuditRecorder,
} from '@nocobase/app-plugin-audit/server';
import {
  normalizeEvent,
  normalizeResourceRef,
} from '../../server/event-normalizer.js';
import {
  createPortableFixture,
  dialects,
  auditRaw,
  auditRows,
  handle,
  type PortableFixture,
} from '../helpers/database-fixtures.js';

const event = { action: 'synthetic.updated', outcome: 'success' as const };
describe.each(dialects)('shared Store/Recorder contract: %s', (dialect) => {
  let f: PortableFixture;
  beforeEach(async () => {
    f = await createPortableFixture(dialect);
  }, 30000);
  afterEach(async () => {
    await f?.cleanup();
  });
  it('rejects conditional or prefix uniqueness instead of claiming complete idempotency protection', async () => {
    if (dialect === 'postgres') {
      await auditRaw(
        f.connection,
        'ALTER TABLE "auditEvents" DROP CONSTRAINT "audit_events_idempotency"',
      );
      await auditRaw(
        f.connection,
        'CREATE UNIQUE INDEX "audit_events_idempotency" ON "auditEvents" ("idempotencyHash") WHERE false',
      );
    } else {
      await auditRaw(
        f.connection,
        'DROP INDEX "audit_events_idempotency"' +
          (dialect === 'mysql' ? ' ON "auditEvents"' : ''),
      );
      await auditRaw(
        f.connection,
        'CREATE UNIQUE INDEX "audit_events_idempotency" ON "auditEvents" ("idempotencyHash"' +
          (dialect === 'mysql' ? '(1))' : ') WHERE 0'),
      );
    }
    await expect(f.store.prepare()).rejects.toMatchObject({
      code: 'AUDIT_NOT_READY',
    });
  });
  it('traverses case-distinct and trailing-space event IDs at identical timestamps exactly once', async () => {
    const ids = ['A', 'a', 'a ', 'a  '];
    for (const id of ids) {
      const normalized = normalizeEvent(event, {
        scope: f.scope,
        kind: 'business',
        producer: 'synthetic-runtime',
        id,
        occurredAt: '2026-09-05T00:00:00.000Z',
        recordedAt: '2026-09-05T00:00:00.000Z',
        store: 'main',
        policyVersion: 7,
      });
      await f.store.append(normalized.event);
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < ids.length + 1; page++) {
      const result = await f.store.query(f.scope, {
        store: 'main',
        pageSize: 1,
        cursor,
      });
      seen.push(...result.items.map((item) => item.id));
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(ids.length);
    expect(new Set(seen)).toEqual(new Set(ids));
    expect(cursor).toBeUndefined();
  });
  it('rejects an incomplete physical schema instead of treating quoted names as literal values', async () => {
    await auditRaw(
      f.connection,
      'ALTER TABLE "auditEvents" DROP COLUMN "payload"',
    );
    await expect(f.store.prepare()).rejects.toMatchObject({
      code: 'AUDIT_NOT_READY',
    });
  });
  it('supports maximum-length indexed identity values without truncation', async () => {
    const long = 'x'.repeat(1024);
    const scope = {
      ...f.scope,
      appId: long,
      securityScope: long,
      actor: { type: 'user', id: long },
      operationId: long,
      requestId: long,
      runId: long,
    };
    const store = new PortableAuditStore(f.connection, {
      appId: long,
      securityScope: long,
      store: 'main',
    });
    await store.prepare();
    const recorder = bindAuditRecorder(scope, {
      store,
      producer: long,
      policy: () =>
        Promise.resolve({ enabled: true, revision: 7, maxDetailsBytes: 65536 }),
    });
    expect(
      (
        await recorder.record(
          { ...event, target: { resource: long, key: long } },
          { idempotencyKey: long.repeat(4) },
        )
      ).state,
    ).toBe('committed');
    expect(
      (
        await store.query(scope, {
          store: 'main',
          actorType: 'user',
          actorId: long,
          operationId: long,
          requestId: long,
          runId: long,
        })
      ).items,
    ).toHaveLength(1);
  });
  it('rejects a missing unique index during explicit readiness preparation', async () => {
    await auditRaw(
      f.connection,
      dialect === 'postgres'
        ? 'ALTER TABLE "auditEvents" DROP CONSTRAINT "audit_events_idempotency"'
        : 'DROP INDEX "audit_events_idempotency"' +
            (dialect === 'mysql' ? ' ON "auditEvents"' : ''),
    );
    await expect(f.store.prepare()).rejects.toMatchObject({
      code: 'AUDIT_NOT_READY',
    });
    await expect(f.recorder.record(event)).rejects.toMatchObject({
      code: 'AUDIT_NOT_READY',
    });
  });
  it('does not lose the winner when concurrent producers submit conflicting semantics', async () => {
    const results = await Promise.allSettled([
      f.recorder.record(event, { idempotencyKey: 'race' }),
      f.recorder.record(
        { ...event, outcome: 'failed' },
        { idempotencyKey: 'race' },
      ),
    ]);
    expect(
      results.filter((value) => value.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(results.find((value) => value.status === 'rejected')).toMatchObject({
      reason: { code: 'AUDIT_IDEMPOTENCY_CONFLICT' },
    });
    expect(
      (await f.store.query(f.scope, { store: 'main' })).items,
    ).toHaveLength(1);
  });
  it('retains exact case and trailing spaces independently of database collation', async () => {
    await f.recorder.record({
      ...event,
      action: 'Case.Action',
      target: { resource: 'Orders', key: { part: 'x ' } },
    });
    expect(
      (await f.store.query(f.scope, { store: 'main', action: 'case.action' }))
        .items,
    ).toHaveLength(0);
    expect(
      (
        await f.store.query(f.scope, {
          store: 'main',
          target: { resource: 'orders' },
        })
      ).items,
    ).toHaveLength(0);
    expect(
      (
        await f.store.query(f.scope, {
          store: 'main',
          target: { resource: 'Orders', key: { part: 'x' } },
        })
      ).items,
    ).toHaveLength(0);
  });
  it('checks the full idempotency identity after a forced digest collision', async () => {
    await f.recorder.record(event, { idempotencyKey: 'collision' });
    await auditRaw(
      f.connection,
      'UPDATE "auditEvents" SET "idempotencyScope" = ?',
      ['synthetic-collision'],
    );
    await expect(
      f.recorder.record(event, { idempotencyKey: 'collision' }),
    ).rejects.toMatchObject({ code: 'AUDIT_IDEMPOTENCY_CONFLICT' });
    expect(
      await auditRows(f.connection, 'SELECT "id" FROM "auditEvents"'),
    ).toHaveLength(1);
  });
  it('keeps retries visible after an outer transaction established an earlier read snapshot', async () => {
    if (dialect === 'sqlite') {
      await f.recorder.record(event, { idempotencyKey: 'snapshot' });
      await f.connection.transaction(async (connection) => {
        await auditRows(connection, 'SELECT * FROM "auditEvents"');
        expect(
          (
            await f.recorder.record(event, {
              idempotencyKey: 'snapshot',
              transaction: handle(connection),
            })
          ).state,
        ).toBe('pending-commit');
      });
      return;
    }
    await f.connection.transaction(async (connection) => {
      await auditRows(connection, 'SELECT * FROM "auditEvents"');
      const original = await f.recorder.record(event, {
        idempotencyKey: 'snapshot',
      });
      expect(
        await f.recorder.record(event, {
          idempotencyKey: 'snapshot',
          transaction: handle(connection),
        }),
      ).toEqual({ ...original, state: 'pending-commit' });
    });
  });
  it('provisions physical indexes and metadata through the public plugin migration and reverses them', async () => {
    expect(await f.metadata.getCollection('auditEvents')).toMatchObject({
      tableName: 'auditEvents',
    });
    expect(await f.metadata.getCollection('auditSettings')).toMatchObject({
      tableName: 'auditSettings',
    });
    await f.store.prepare();
    expect(await f.migrator.latest()).toMatchObject({ executed: [] });
    expect(await f.migrator.rollback()).toMatchObject({
      rolledBack: ['202609050001-create-audit-storage'],
    });
    expect(await f.metadata.getCollection('auditEvents')).toBeUndefined();
    await expect(f.store.prepare()).rejects.toMatchObject({
      code: 'AUDIT_NOT_READY',
    });
    await expect(
      auditRows(f.connection, 'SELECT * FROM "auditEvents"'),
    ).rejects.toThrow();
    await f.migrator.latest();
    await f.store.prepare();
  });
  it('round-trips UTC, safe JSON, BigInt strings, absent fields, explicit null and large Unicode keys', async () => {
    const target = {
      resource: 'synthetic-resource',
      dataSource: 'business-source',
      key: { z: '字'.repeat(21000), a: 1 },
    };
    const receipt = await f.recorder.record({
      ...event,
      target,
      details: {
        amount: 12345678901234567890n,
        nullable: null,
        nested: { visible: true },
        token: 'SYNTHETIC_SECRET',
        text: '文'.repeat(24000),
      },
    });
    if (receipt.state !== 'committed') throw new Error('Expected committed.');
    const saved = await f.store.findById(f.scope, receipt.eventId);
    expect(saved).toMatchObject({
      ...event,
      appId: f.scope.appId,
      kind: 'business',
      producer: 'synthetic-runtime',
      policyVersion: 7,
      store: 'main',
      target,
      details: { amount: '12345678901234567890', nullable: null },
    });
    expect(saved?.securityScope).toBeUndefined();
    expect(saved?.occurredAt).toBe(new Date(saved!.occurredAt).toISOString());
    expect(JSON.stringify(saved)).not.toContain('SYNTHETIC_SECRET');
    expect(
      (await f.store.query(f.scope, { store: 'main', target })).items,
    ).toHaveLength(1);
    const otherTarget = { ...target, key: { ...target.key, a: '1' } };
    await f.recorder.record({ ...event, target: otherTarget });
    await auditRaw(
      f.connection,
      'UPDATE "auditEvents" SET "targetKeyHash" = ?',
      [normalizeResourceRef(target, f.scope).keyHash],
    );
    expect(
      (await f.store.query(f.scope, { store: 'main', target })).items,
    ).toEqual([saved]);
  });
  it('persists one event under concurrent idempotent retries and retains original time', async () => {
    const receipts = await Promise.all(
      Array.from({ length: 12 }, () =>
        f.recorder.record(event, { idempotencyKey: 'concurrent' }),
      ),
    );
    expect(
      new Set(receipts.map((r) => ('eventId' in r ? r.eventId : r.state))).size,
    ).toBe(1);
    const first = (await f.store.query(f.scope, { store: 'main' })).items;
    expect(first).toHaveLength(1);
    expect(
      await f.recorder.record(event, { idempotencyKey: 'concurrent' }),
    ).toEqual(receipts[0]);
    expect((await f.store.query(f.scope, { store: 'main' })).items).toEqual(
      first,
    );
  });

  it('isolates identical keys by App, absent versus present security scope and producer', async () => {
    for (const [appId, securityScope, producer] of [
      ['synthetic-app', undefined, 'one'],
      ['synthetic-other', undefined, 'one'],
      ['synthetic-app', 'null', 'one'],
      ['synthetic-app', 'NULL', 'one'],
      ['synthetic-app', undefined, 'two'],
    ] as const) {
      const scope = { ...f.scope, appId, securityScope };
      const store = new PortableAuditStore(f.connection, {
        appId,
        securityScope,
        store: 'main',
      });
      await store.prepare();
      const recorder = bindAuditRecorder(scope, {
        producer,
        store,
        policy: () =>
          Promise.resolve({
            enabled: true,
            revision: 7,
            maxDetailsBytes: 65536,
          }),
      });
      expect(
        (await recorder.record(event, { idempotencyKey: 'same' })).state,
      ).toBe('committed');
    }
    expect(
      await auditRows(f.connection, 'SELECT "id" FROM "auditEvents"'),
    ).toHaveLength(5);
  });
  it('keeps native transactions queryable after duplicates and semantic conflicts while enforcing rollback-only', async () => {
    const original = await f.recorder.record(event, {
      idempotencyKey: 'duplicate',
    });
    await f.connection.transaction(async (connection) => {
      const receipt = await f.recorder.record(event, {
        transaction: handle(connection),
        idempotencyKey: 'duplicate',
      });
      expect(receipt).toEqual({ ...original, state: 'pending-commit' });
      expect(await auditRows(connection, 'SELECT 1 AS ok')).toMatchObject([
        { ok: 1 },
      ]);
    });
    await expect(
      f.connection.transaction(async (connection) => {
        await expect(
          f.recorder.record(
            { ...event, outcome: 'failed' },
            { transaction: handle(connection), idempotencyKey: 'duplicate' },
          ),
        ).rejects.toMatchObject({ code: 'AUDIT_IDEMPOTENCY_CONFLICT' });
        expect(await auditRows(connection, 'SELECT 1 AS ok')).toMatchObject([
          { ok: 1 },
        ]);
      }),
    ).rejects.toThrow('rollback-only');
    expect(
      (await f.store.query(f.scope, { store: 'main' })).items,
    ).toHaveLength(1);
  });
  it('reads pending events through the owning transaction, rolls back with business writes, and rejects expired handles', async () => {
    await auditRaw(
      f.connection,
      'CREATE TABLE synthetic_business (id INTEGER PRIMARY KEY)',
    );
    let expired: TransactionHandle | undefined;
    let eventId = '';
    await expect(
      f.connection.transaction(async (connection) => {
        expired = handle(connection);
        await connection.query
          .insertInto('synthetic_business')
          .values({ id: 1 })
          .execute();
        const receipt = await f.recorder.record(event, {
          transaction: expired,
        });
        expect(receipt.state).toBe('pending-commit');
        if (receipt.state !== 'pending-commit')
          throw new Error('Expected pending.');
        eventId = receipt.eventId;
        expect(await f.store.findById(f.scope, eventId, expired)).toMatchObject(
          event,
        );
        throw new Error('Synthetic rollback');
      }),
    ).rejects.toThrow('Synthetic rollback');
    expect(
      await auditRows(f.connection, 'SELECT * FROM synthetic_business'),
    ).toEqual([]);
    expect((await f.store.query(f.scope, { store: 'main' })).items).toEqual([]);
    expect(await f.store.findById(f.scope, eventId)).toBeUndefined();
    await expect(
      f.recorder.record(event, { transaction: expired }),
    ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
  });
  it('fails closed for a missing local table and never provisions during record', async () => {
    await auditRaw(f.connection, 'DROP TABLE "auditEvents"');
    await expect(f.recorder.record(event)).rejects.toMatchObject({
      code: 'AUDIT_WRITE_FAILED',
    });
    await expect(f.store.prepare()).rejects.toMatchObject({
      code: 'AUDIT_NOT_READY',
    });
    await expect(f.recorder.record(event)).rejects.toMatchObject({
      code: 'AUDIT_NOT_READY',
    });
    await expect(
      auditRows(f.connection, 'SELECT * FROM "auditEvents"'),
    ).rejects.toThrow();
  });
  it('paginates without duplicate events and binds cursors to filters and scope', async () => {
    for (let i = 0; i < 4; i++)
      await f.recorder.record({ ...event, details: { i } });
    const page = await f.store.query(f.scope, { store: 'main', pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeDefined();
    const next = await f.store.query(f.scope, {
      store: 'main',
      pageSize: 2,
      cursor: page.nextCursor,
    });
    expect(next.items).toHaveLength(2);
    expect(
      new Set([...page.items, ...next.items].map((item) => item.id)).size,
    ).toBe(4);
    expect(next.nextCursor).toBeUndefined();
    // Input guards are independent of the database dialect.
    if (dialect === 'sqlite') {
      await expect(
        f.store.query(f.scope, {
          store: 'main',
          cursor: page.nextCursor,
          action: 'other',
        }),
      ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
      await expect(
        f.store.query({ ...f.scope, appId: 'other-app' }, { store: 'main' }),
      ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
      await expect(
        f.store.query(f.scope, { store: 'main', pageSize: 101 }),
      ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
      const wrongStore = new PortableAuditStore(f.connection, {
        ...f.store.binding,
        store: 'other',
      });
      await expect(wrongStore.prepare()).rejects.toMatchObject({
        code: 'AUDIT_TARGET_UNSUPPORTED',
      });
    }
  });
});
