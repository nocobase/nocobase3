import { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigrator, createDatabaseManager } from '@nocobase/db';
import {
  bindAuditRecorder,
  SqliteAuditStore,
} from '@nocobase/app-plugin-audit/server';
import { join } from 'node:path';
import {
  createFixture,
  type Fixture,
  type RawClient,
} from './sqlite-fixture.js';

const event = { action: 'synthetic.created', outcome: 'success' as const };
describe('SQLite storage', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await createFixture();
  });
  afterEach(async () => {
    await f?.cleanup();
  });

  it('migrates physical fields, indexes and metadata and rolls down only the temporary database', async () => {
    const client = await f.connection.client<RawClient>();
    const columns = await client.raw('PRAGMA table_info("auditEvents")');
    expect(columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'eventHash', pk: 1 }),
        expect.objectContaining({
          name: 'idempotencyHash',
          type: 'varchar(64)',
        }),
        expect.objectContaining({ name: 'securityScope', notnull: 1 }),
        expect.objectContaining({ name: 'payload', notnull: 1 }),
        expect.objectContaining({ name: 'targetKeyEncoding' }),
      ]),
    );
    expect(await client.raw('PRAGMA index_list("auditEvents")')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'audit_events_idempotency',
          unique: 1,
        }),
        expect.objectContaining({ name: 'audit_events_scope_time' }),
        expect.objectContaining({ name: 'audit_events_target' }),
        expect.objectContaining({ name: 'audit_events_actor' }),
        expect.objectContaining({ name: 'audit_events_operation' }),
        expect.objectContaining({ name: 'audit_events_request' }),
        expect.objectContaining({ name: 'audit_events_run' }),
      ]),
    );
    expect(
      await client.raw('PRAGMA index_info("audit_events_scope_time")'),
    ).toEqual([
      expect.objectContaining({ name: 'scopeIndex' }),
      expect.objectContaining({ name: 'occurredAt' }),
      expect.objectContaining({ name: 'eventHash' }),
    ]);
    expect(await client.raw('PRAGMA foreign_key_list("auditEvents")')).toEqual(
      [],
    );
    expect(await f.metadata.getCollection('auditEvents')).toMatchObject({
      tableName: 'auditEvents',
    });
    expect(await f.metadata.getCollection('auditSettings')).toMatchObject({
      tableName: 'auditSettings',
    });
    const migrator = createMigrator({
      database: f.manager,
      directory: new URL('../../server/database/migrations', import.meta.url)
        .pathname,
      packageName: '@nocobase/app-plugin-audit',
    });
    expect(await migrator.latest()).toMatchObject({
      executed: [],
      skipped: ['202609050001-create-audit-storage'],
    });
    expect(await migrator.rollback()).toMatchObject({
      rolledBack: ['202609050001-create-audit-storage'],
    });
    expect(
      await client.raw(
        "SELECT name FROM sqlite_master WHERE name IN ('auditEvents', 'auditSettings')",
      ),
    ).toEqual([]);
    expect(await f.metadata.getCollection('auditEvents')).toBeUndefined();
    expect(await f.metadata.getCollection('auditSettings')).toBeUndefined();
  });

  it('persists normalized JSON and long typed resource keys after reconnect and does not cascade deletes', async () => {
    const client = await f.connection.client<RawClient>();
    await client.raw('CREATE TABLE syntheticUsers (id TEXT PRIMARY KEY)');
    await client.raw('CREATE TABLE syntheticTargets (id TEXT PRIMARY KEY)');
    await client.raw('INSERT INTO syntheticUsers VALUES (?)', [
      'synthetic-user',
    ]);
    await client.raw('INSERT INTO syntheticTargets VALUES (?)', [
      'synthetic-target',
    ]);
    const target = {
      resource: 'syntheticTargets',
      dataSource: 'business',
      key: { z: 'x'.repeat(12000), a: 1 },
    };
    const receipt = await f.recorder.record({
      ...event,
      target,
      details: {
        amount: 123n,
        token: 'SYNTHETIC_SECRET',
        safe: { value: true },
      },
    });
    expect(receipt.state).toBe('committed');
    if (receipt.state !== 'committed') throw new Error('Expected commit.');
    await client.raw('DELETE FROM syntheticUsers');
    await client.raw('DELETE FROM syntheticTargets');
    f.policy = { ...f.policy, enabled: false };
    await f.manager.reconnect();
    const saved = await f.store.findById(f.scope, receipt.eventId);
    expect(saved).toMatchObject({
      target,
      store: 'main',
      details: { amount: '123', safe: { value: true } },
    });
    expect(JSON.stringify(saved)).not.toContain('SYNTHETIC_SECRET');
    expect(await f.recorder.record(event)).toMatchObject({ state: 'disabled' });
    expect(
      (await f.store.query(f.scope, { store: 'main', target })).items,
    ).toHaveLength(1);
  });

  it('uses durable uniqueness across recorder/store/manager instances and preserves the first timestamps', async () => {
    const first = await f.recorder.record(event, { idempotencyKey: 'stable' });
    if (first.state !== 'committed') throw new Error('Expected commit.');
    const saved = await f.store.findById(f.scope, first.eventId);
    const manager = createDatabaseManager({
      connections: {
        main: {
          dialect: 'sqlite',
          filename: join(f.directory, 'audit.sqlite'),
        },
      },
    });
    try {
      const store = new SqliteAuditStore(manager.connection(), f.store.binding);
      await store.prepare();
      const recorder = bindAuditRecorder(f.scope, {
        producer: 'synthetic-runtime',
        store,
        policy: () => Promise.resolve({ ...f.policy, revision: 9 }),
      });
      expect(
        await recorder.record(event, { idempotencyKey: 'stable' }),
      ).toEqual(first);
      expect(await store.findById(f.scope, first.eventId)).toEqual(saved);
      expect(
        (await store.query(f.scope, { store: 'main' })).items,
      ).toHaveLength(1);
      await expect(
        recorder.record(
          { ...event, outcome: 'failed' },
          { idempotencyKey: 'stable' },
        ),
      ).rejects.toMatchObject({ code: 'AUDIT_IDEMPOTENCY_CONFLICT' });
    } finally {
      await manager.destroy();
    }
  });

  it('binds signed cursors to filters and scope, and scopes bounded cleanup', async () => {
    for (let i = 0; i < 3; i++)
      await f.recorder.record({ ...event, details: { index: i } });
    const page = await f.store.query(f.scope, { store: 'main', pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeDefined();
    const next = await f.store.query(f.scope, {
      store: 'main',
      pageSize: 2,
      cursor: page.nextCursor,
    });
    expect(next.items).toHaveLength(1);
    expect(next.items[0].id).not.toBe(page.items[0].id);
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
    expect(
      await f.store.deleteBatch(f.scope, {
        store: 'main',
        cutoff: '2099-01-01T00:00:00.000Z',
        limit: 2,
      }),
    ).toBe(2);
    expect(
      (await f.store.query(f.scope, { store: 'main' })).items,
    ).toHaveLength(1);
  });
  it('converges simultaneous independent Node processes on one persistent idempotency row', async () => {
    const workers = Array.from({ length: 4 }, () => {
      const child = spawn(
        process.execPath,
        [
          '--import',
          new URL(
            '../../../../../node_modules/tsx/dist/loader.mjs',
            import.meta.url,
          ).pathname,
          new URL('./sqlite-worker.ts', import.meta.url).pathname,
          join(f.directory, 'audit.sqlite'),
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
      let output = '';
      let errors = '';
      const ready = new Promise<void>((resolve, reject) => {
        child.stdout.on('data', (chunk: Buffer) => {
          output += chunk.toString();
          if (output.includes('READY\n')) resolve();
        });
        child.once('error', reject);
        child.once('exit', () => {
          if (!output.includes('READY\n'))
            reject(new Error('Worker exited before ready: ' + errors));
        });
      });
      child.stderr.on('data', (chunk: Buffer) => {
        errors += chunk.toString();
      });
      const result = new Promise<string>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code) => {
          if (code === 0) resolve(output.trim().split('\n').at(-1) ?? '');
          else reject(new Error('Worker failed: ' + errors));
        });
      });
      return { child, ready, result };
    });
    try {
      await Promise.all(workers.map((worker) => worker.ready));
      for (const worker of workers) worker.child.stdin.write('GO\n');
      const receipts = await Promise.all(
        workers.map((worker) => worker.result),
      );
      expect(new Set(receipts).size).toBe(1);
      expect(JSON.parse(receipts[0])).toMatchObject({ state: 'committed' });
      expect(
        (await f.store.query(f.scope, { store: 'main' })).items,
      ).toHaveLength(1);
    } finally {
      for (const worker of workers) worker.child.kill();
      await Promise.allSettled(workers.map((worker) => worker.result));
    }
  }, 20000);
  it('rejects incomplete migration schemas and never treats a wrong physical store label as ready', async () => {
    const store = new SqliteAuditStore(f.connection, {
      ...f.store.binding,
      store: 'other',
    });
    await expect(store.prepare()).rejects.toMatchObject({
      code: 'AUDIT_TARGET_UNSUPPORTED',
    });
    const client = await f.connection.client<RawClient>();
    await client.raw(
      'ALTER TABLE auditEvents RENAME COLUMN action TO synthetic_missing_action',
    );
    await expect(f.store.prepare()).rejects.toMatchObject({
      code: 'AUDIT_NOT_READY',
    });
    await expect(f.recorder.record(event)).rejects.toMatchObject({
      code: 'AUDIT_NOT_READY',
    });
  });

  it('keeps cleanup in the selected app and restores composite key types without digest-only matches', async () => {
    const target = { resource: 'synthetic-resource', key: { a: 1, b: '2' } };
    await f.recorder.record({ ...event, target });
    await f.recorder.record({
      ...event,
      target: { ...target, key: { a: '1', b: 2 } },
    });
    const otherScope = { ...f.scope, appId: 'other-app' };
    const other = new SqliteAuditStore(f.connection, {
      ...f.store.binding,
      appId: otherScope.appId,
    });
    await other.prepare();
    await bindAuditRecorder(otherScope, {
      producer: 'synthetic-runtime',
      store: other,
      policy: () => Promise.resolve(f.policy),
    }).record(event);
    const client = await f.connection.client<RawClient>();
    await client.raw(
      'UPDATE auditEvents SET targetKeyHash = (SELECT targetKeyHash FROM auditEvents WHERE targetKeyEncoding = ? LIMIT 1) WHERE targetResource = ?',
      [
        JSON.stringify([
          'composite',
          [
            ['a', 'number', 1],
            ['b', 'string', '2'],
          ],
        ]),
        'synthetic-resource',
      ],
    );
    expect(
      (await f.store.query(f.scope, { store: 'main', target })).items,
    ).toHaveLength(1);
    expect(
      await f.store.deleteBatch(f.scope, {
        store: 'main',
        cutoff: '2099-01-01T00:00:00.000Z',
        limit: 100,
      }),
    ).toBe(2);
    expect(
      (await other.query(otherScope, { store: 'main' })).items,
    ).toHaveLength(1);
  });
});
