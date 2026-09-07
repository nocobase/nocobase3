import { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseManager } from '@nocobase/db';
import {
  bindAuditRecorder,
  PortableAuditStore,
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
    expect(await f.migrator.latest()).toMatchObject({
      executed: [],
      skipped: ['202609050001-create-audit-storage'],
    });
    expect(await f.migrator.rollback()).toMatchObject({
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

  it('retains events after related rows are deleted, reconnects, and retries through a new manager with a changed policy', async () => {
    const client = await f.connection.client<RawClient>();
    await client.raw('CREATE TABLE syntheticUsers (id TEXT PRIMARY KEY)');
    await client.raw('CREATE TABLE syntheticTargets (id TEXT PRIMARY KEY)');
    await client.raw('INSERT INTO syntheticUsers VALUES (?)', [
      'synthetic-user',
    ]);
    await client.raw('INSERT INTO syntheticTargets VALUES (?)', [
      'synthetic-target',
    ]);
    const input = {
      ...event,
      target: { resource: 'syntheticTargets', key: 'synthetic-target' },
    };
    const first = await f.recorder.record(input, { idempotencyKey: 'stable' });
    if (first.state !== 'committed') throw new Error('Expected commit.');
    const saved = await f.store.findById(f.scope, first.eventId);
    expect(saved).toMatchObject({ ...input, policyVersion: 7 });
    await client.raw('DELETE FROM syntheticUsers');
    await client.raw('DELETE FROM syntheticTargets');
    f.policy = { ...f.policy, enabled: false };
    await f.manager.reconnect();
    expect(await f.store.findById(f.scope, first.eventId)).toEqual(saved);
    expect(await f.recorder.record(event)).toMatchObject({ state: 'disabled' });

    const manager = createDatabaseManager({
      connections: {
        main: {
          dialect: 'sqlite',
          filename: join(f.directory, 'audit.sqlite'),
        },
      },
    });
    try {
      const store = new PortableAuditStore(
        manager.connection(),
        f.store.binding,
      );
      await store.prepare();
      const recorder = bindAuditRecorder(f.scope, {
        producer: 'synthetic-runtime',
        store,
        policy: () =>
          Promise.resolve({ ...f.policy, enabled: true, revision: 9 }),
      });
      expect(
        await recorder.record(input, { idempotencyKey: 'stable' }),
      ).toEqual(first);
      expect((await store.query(f.scope, { store: 'main' })).items).toEqual([
        saved,
      ]);
      await expect(
        recorder.record(
          { ...input, outcome: 'failed' },
          { idempotencyKey: 'stable' },
        ),
      ).rejects.toMatchObject({ code: 'AUDIT_IDEMPOTENCY_CONFLICT' });
    } finally {
      await manager.destroy();
    }
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
});
