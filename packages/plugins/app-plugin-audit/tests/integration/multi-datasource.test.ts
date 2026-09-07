import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseManager } from '@nocobase/db';
import {
  PortableAuditStore,
  bindAuditRecorder,
} from '@nocobase/app-plugin-audit/server';
import {
  createPortableFixture,
  dialects,
  auditRaw,
  auditRows,
  handle,
  type PortableFixture,
} from '../helpers/database-fixtures.js';

describe.each(dialects)(
  'local atomicity and observation separation: %s',
  (dialect) => {
    const fixtures: PortableFixture[] = [];
    const open = async (
      name: string,
      migrate: boolean = true,
    ): Promise<PortableFixture> => {
      const fixture = await createPortableFixture(dialect, migrate, name);
      fixtures.push(fixture);
      return fixture;
    };
    afterEach(async () => {
      for (const fixture of fixtures.splice(0)) await fixture.cleanup();
    });
    it('isolates store identity even in one physical table and rejects another connection of the same manager', async () => {
      const source = await open('main');
      const manager = createDatabaseManager({
        default: 'a',
        connections: { a: source.config, b: source.config },
      });
      try {
        const a = new PortableAuditStore(manager.connection('a'), {
          appId: source.scope.appId,
          store: 'a',
        });
        const b = new PortableAuditStore(manager.connection('b'), {
          appId: source.scope.appId,
          store: 'b',
        });
        await a.prepare();
        await b.prepare();
        const policy = () =>
          Promise.resolve({
            enabled: true,
            revision: 1,
            maxDetailsBytes: 65536,
          });
        const recorderA = bindAuditRecorder(source.scope, {
          producer: 'same',
          store: a,
          policy,
        });
        const recorderB = bindAuditRecorder(source.scope, {
          producer: 'same',
          store: b,
          policy,
        });
        const event = { action: 'synthetic.same', outcome: 'success' as const };
        expect(
          await recorderA.record(event, { idempotencyKey: 'same' }),
        ).not.toEqual(
          await recorderB.record(event, { idempotencyKey: 'same' }),
        );
        expect(
          await auditRows(source.connection, 'SELECT "id" FROM "auditEvents"'),
        ).toHaveLength(2);
        await manager.connection('a').transaction(async (connection) => {
          await expect(
            recorderB.record(event, { transaction: handle(connection) }),
          ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
        });
        expect(
          (await a.query(source.scope, { store: 'a' })).items,
        ).toHaveLength(1);
        expect(
          (await b.query(source.scope, { store: 'b' })).items,
        ).toHaveLength(1);
      } finally {
        await manager.destroy();
      }
    }, 30000);
    it('commits A only with A local event while B observation failure remains an explicit independent failure', async () => {
      const a = await open('business-a');
      const b = await open('observation');
      await auditRaw(
        a.connection,
        'CREATE TABLE synthetic_business (id INTEGER PRIMARY KEY)',
      );
      await auditRaw(b.connection, 'DROP TABLE "auditEvents"');
      await a.connection.transaction(async (connection) => {
        await connection.query
          .insertInto('synthetic_business')
          .values({ id: 1 })
          .execute();
        const receipt = await a.recorder.record(
          {
            action: 'synthetic.created',
            outcome: 'success',
            target: {
              resource: 'synthetic_business',
              dataSource: 'business-a',
              key: '1',
            },
          },
          { transaction: handle(connection), idempotencyKey: 'same' },
        );
        expect(receipt.state).toBe('pending-commit');
        await expect(
          b.recorder.record(
            { action: 'synthetic.observed', outcome: 'success' },
            { transaction: handle(connection) },
          ),
        ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
      });
      expect(
        await auditRows(a.connection, 'SELECT * FROM synthetic_business'),
      ).toHaveLength(1);
      expect(
        (await a.store.query(a.scope, { store: 'business-a' })).items,
      ).toMatchObject([
        { store: 'business-a', target: { dataSource: 'business-a' } },
      ]);
      await expect(
        b.recorder.record({ action: 'synthetic.observed', outcome: 'success' }),
      ).rejects.toMatchObject({ code: 'AUDIT_WRITE_FAILED' });
    }, 30000);
    it('requires local provisioning and rolls A business back on caught local audit failure despite healthy B', async () => {
      const a = await open('business-a', false);
      const b = await open('observation');
      await expect(a.store.prepare()).rejects.toMatchObject({
        code: 'AUDIT_NOT_READY',
      });
      await auditRaw(
        a.connection,
        'CREATE TABLE synthetic_business (id INTEGER PRIMARY KEY)',
      );
      await a.migrator.latest();
      await a.store.prepare();
      await auditRaw(a.connection, 'DROP TABLE "auditEvents"');
      await expect(
        a.connection.transaction(async (connection) => {
          await connection.query
            .insertInto('synthetic_business')
            .values({ id: 1 })
            .execute();
          await expect(
            a.recorder.record(
              { action: 'synthetic.created', outcome: 'success' },
              { transaction: handle(connection) },
            ),
          ).rejects.toMatchObject({ code: 'AUDIT_WRITE_FAILED' });
        }),
      ).rejects.toThrow('rollback-only');
      expect(
        await auditRows(a.connection, 'SELECT * FROM synthetic_business'),
      ).toEqual([]);
      expect(
        (await b.store.query(b.scope, { store: 'observation' })).items,
      ).toEqual([]);
    }, 30000);
    it('isolates identical idempotency keys by store and keeps business target distinct in observation DTOs', async () => {
      const a = await open('business-a');
      const b = await open('observation');
      const event = {
        action: 'synthetic.updated',
        outcome: 'success' as const,
        target: { resource: 'orders', dataSource: 'business-a', key: '42' },
      };
      const one = await a.recorder.record(event, { idempotencyKey: 'same' });
      const two = await b.recorder.record(event, { idempotencyKey: 'same' });
      expect(one).not.toEqual(two);
      expect(
        (await b.store.query(b.scope, { store: 'observation' })).items,
      ).toMatchObject([
        { store: 'observation', target: { dataSource: 'business-a' } },
      ]);
      await expect(
        a.store.query(b.scope, { store: 'observation' }),
      ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
    }, 30000);
  },
);
