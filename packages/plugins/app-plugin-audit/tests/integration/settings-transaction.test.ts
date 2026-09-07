import { PortableAuditStore } from '../../server/store.js';
import { afterEach, describe, expect, it } from 'vitest';
import { transactionAuthority, type TransactionHandle } from '@nocobase/db';
import { PersistentAuditSettingsService } from '../../server/settings-service.js';
import { AuditReadiness } from '../../server/providers/readiness.js';
import { AuditCaptureCatalog } from '../../server/capture-catalog.js';
import { LocalAuditHealthService } from '../../server/health-service.js';
import {
  createPortableFixture,
  dialects,
  auditRaw,
  auditRows,
  type PortableFixture,
} from '../helpers/database-fixtures.js';

const fixtures: PortableFixture[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((f) => f.cleanup()));
});
async function fixture(dialect: (typeof dialects)[number], name = 'main') {
  const f = await createPortableFixture(dialect, true, name);
  fixtures.push(f);
  return f;
}
async function service(f: PortableFixture) {
  const health = new LocalAuditHealthService(() => undefined);
  const readiness = new AuditReadiness({
    stores: [{ connection: f.connection, store: f.store }],
    catalog: new AuditCaptureCatalog(),
    health,
    requirements: {
      auditRequired: false,
      mandatorySources: [],
      requiredDataSources: [],
    },
  });
  await readiness.prepare();
  const settings = new PersistentAuditSettingsService({
    connection: f.connection,
    store: f.store,
    readiness,
    health,
  });
  await settings.initialize(f.scope);
  return settings;
}
function active(
  connection: Parameters<typeof transactionAuthority.current>[0],
): TransactionHandle {
  const handle = transactionAuthority.current(connection);
  if (!handle) throw new Error('Missing test transaction.');
  return handle;
}

for (const dialect of dialects)
  describe('explicit settings transaction ' + dialect, () => {
    it('reads its configuration transaction without acquiring the busy root pool and pins revision through rollback', async () => {
      const f = await fixture(dialect);
      const settings = await service(f);
      let pending: ReturnType<typeof settings.snapshot> | undefined;
      let timedOut = false;
      const before = await settings.get(f.scope);
      try {
        await expect(
          f.connection.transaction(async (connection) => {
            const transaction = active(connection);
            await auditRaw(
              connection,
              'UPDATE "auditSettings" SET "revision" = ?, "settings" = ?',
              [
                2,
                JSON.stringify({ ...before, revision: 2, retentionDays: 365 }),
              ],
            );
            pending = settings.snapshot(f.scope, { transaction });
            let timer: ReturnType<typeof setTimeout> | undefined;
            const snapshot = await Promise.race([
              pending,
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  timedOut = true;
                  reject(new Error('Snapshot acquired its own busy pool'));
                }, 500);
              }),
            ]).finally(() => {
              clearTimeout(timer);
            });
            expect(snapshot).toMatchObject({ revision: 2, retentionDays: 365 });
            await auditRaw(
              connection,
              'UPDATE "auditSettings" SET "revision" = ?, "settings" = ?',
              [
                3,
                JSON.stringify({ ...before, revision: 3, retentionDays: 400 }),
              ],
            );
            expect(snapshot.revision).toBe(2);
            expect(
              (await settings.recorderPolicy(f.scope, { transaction }))
                .revision,
            ).toBe(3);
            throw new Error('Synthetic rollback');
          }),
        ).rejects.toThrow('Synthetic rollback');
      } finally {
        await pending?.catch(() => undefined);
      }
      expect(timedOut).toBe(false);
      expect((await settings.get(f.scope)).revision).toBe(1);
    });

    it('rejects foreign manager, different connection, forged and completed handles without falling back', async () => {
      const f = await fixture(dialect);
      const other = await fixture(dialect);
      const otherSource = await fixture(dialect, 'business');
      const settings = await service(f);
      for (const foreign of [other, otherSource])
        await foreign.connection.transaction(async (connection) => {
          await expect(
            settings.snapshot(f.scope, { transaction: active(connection) }),
          ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
        });
      let completed: TransactionHandle | undefined;
      await f.connection.transaction(async (connection) => {
        const handle = active(connection);
        completed = handle;
        await expect(
          settings.snapshot(f.scope, { transaction: { ...handle } }),
        ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
      });
      await expect(
        settings.snapshot(f.scope, { transaction: completed }),
      ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
    });

    it('reads the independent configuration store explicitly during a non-default business transaction', async () => {
      const config = await fixture(dialect);
      const business = await fixture(dialect, 'business');
      const settings = await service(config);
      await auditRaw(
        business.connection,
        'CREATE TABLE "settings_probe" ("id" INTEGER PRIMARY KEY)',
      );
      await expect(
        business.connection.transaction(async (connection) => {
          await auditRaw(
            connection,
            'INSERT INTO "settings_probe" ("id") VALUES (?)',
            [1],
          );
          const snapshot = await settings.snapshot(config.scope);
          expect(snapshot).toMatchObject({
            revision: 1,
            observationStore: 'main',
          });
          await settings.update(config.scope, {
            expectedRevision: 1,
            settings: { ...snapshot, retentionDays: 365 },
            confirmRetentionReduction: false,
          });
          expect(snapshot.revision).toBe(1);
          expect((await settings.snapshot(config.scope)).revision).toBe(2);
          throw new Error('Business rollback');
        }),
      ).rejects.toThrow('Business rollback');
      expect(
        await auditRows(
          business.connection,
          'SELECT "id" FROM "settings_probe"',
        ),
      ).toEqual([]);
      expect((await settings.get(config.scope)).revision).toBe(2);
    });
  });

for (const dialect of dialects)
  describe('nested and rollback-only settings ' + dialect, () => {
    it('accepts nested issued handles and keeps rollback-only transactions uncommittable after a read', async () => {
      const f = await fixture(dialect);
      const settings = await service(f);
      let finished: TransactionHandle | undefined;
      await expect(
        f.connection.transaction(async (outer) => {
          await outer.transaction(async (inner) => {
            const handle = active(inner);
            expect(
              (await settings.snapshot(f.scope, { transaction: handle }))
                .revision,
            ).toBe(1);
            transactionAuthority.markRollbackOnly(handle);
            // The existing authority permits reads until completion; it still forbids commit.
            transactionAuthority.validate(handle, inner);
            expect(
              (await settings.get(f.scope, { transaction: handle })).revision,
            ).toBe(1);
            finished = handle;
          });
        }),
      ).rejects.toThrow('rollback-only');
      await expect(
        settings.snapshot(f.scope, { transaction: finished }),
      ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
      expect((await settings.snapshot(f.scope)).revision).toBe(1);
    });
  });

for (const dialect of dialects)
  describe('configuration Store composition ' + dialect, () => {
    it('accepts only the exact configuration Store instance before collector startup', async () => {
      const f = await fixture(dialect);
      const foreign = await fixture(dialect);
      const settings = await service(f);
      const another = new PortableAuditStore(f.connection, f.store.binding);
      await another.prepare();
      expect(() => settings.assertConfigurationStore(f.store)).not.toThrow();
      expect(() => settings.assertConfigurationStore(foreign.store)).toThrow(
        'AUDIT_TRANSACTION_MISMATCH',
      );
      expect(() => settings.assertConfigurationStore(another)).toThrow(
        'AUDIT_TRANSACTION_MISMATCH',
      );
      expect((await settings.get(f.scope)).revision).toBe(1);
    });
  });
