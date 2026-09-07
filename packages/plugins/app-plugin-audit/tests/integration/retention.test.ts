import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditRetentionService } from '../../server/retention-service.js';
import { AuditCaptureCatalog } from '../../server/capture-catalog.js';
import {
  LocalAuditHealthService,
  type AuditHealthDiagnostic,
} from '../../server/health-service.js';
import { AuditReadiness } from '../../server/providers/readiness.js';
import { PersistentAuditSettingsService } from '../../server/settings-service.js';
import { PortableAuditStore } from '../../server/store.js';
import { normalizeEvent } from '../../server/event-normalizer.js';
import type { AuditSettings } from '../../server/contracts.js';
import {
  createPortableFixture,
  dialects,
  auditRaw,
  auditRows,
  type PortableFixture,
} from '../helpers/database-fixtures.js';

const fixtures: PortableFixture[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0).reverse()) await f.cleanup();
});
async function setup(
  f: PortableFixture,
  defaults: Partial<Omit<AuditSettings, 'revision'>> = {},
  batchSize = 2,
  maxBatches = 100,
) {
  const diagnostics: AuditHealthDiagnostic[] = [];
  const health = new LocalAuditHealthService((event) =>
    diagnostics.push(event),
  );
  const catalog = new AuditCaptureCatalog();
  const readiness = new AuditReadiness({
    stores: [{ connection: f.connection, store: f.store }],
    catalog,
    health,
    requirements: {
      auditRequired: false,
      mandatorySources: [],
      requiredDataSources: [],
    },
  });
  const settings = new PersistentAuditSettingsService({
    connection: f.connection,
    store: f.store,
    readiness,
    health,
    defaults: { enabled: true, ...defaults },
  });
  await settings.initialize(f.scope);
  await readiness.prepare();
  const options = {
    connection: f.connection,
    store: f.store,
    configurationStore: f.store,
    settings,
    health,
    batchSize,
    maxBatches,
  };
  return {
    service: new AuditRetentionService(options),
    settings,
    health,
    diagnostics,
    options,
  };
}
async function seed(
  store: PortableAuditStore,
  count: number,
  at: string = '2000-01-01T00:00:00.000Z',
) {
  for (let index = 0; index < count; index++) {
    const { event } = normalizeEvent(
      {
        action: 'synthetic.secret.action',
        outcome: 'success',
        details: { note: 'RETENTION-SYNTHETIC-RAW-CONTENT' },
      },
      {
        scope: {
          appId: store.binding.appId,
          securityScope: store.binding.securityScope,
          actor: { type: 'user', id: 'synthetic' },
        },
        kind: 'business',
        producer: 'synthetic-runtime',
        id: randomUUID(),
        occurredAt: at,
        recordedAt: at,
        store: store.binding.store,
        policyVersion: 1,
      },
    );
    await store.append(event);
  }
}
async function originalCount(f: PortableFixture): Promise<number> {
  return Number(
    (
      await auditRows(
        f.connection,
        'SELECT COUNT(*) AS count FROM "auditEvents" WHERE "producer" = ?',
        ['synthetic-runtime'],
      )
    )[0].count,
  );
}
for (const dialect of dialects)
  describe('retention real ' + dialect, () => {
    async function fixture(name = 'main') {
      const f = await createPortableFixture(dialect, true, name);
      fixtures.push(f);
      return f;
    }

    it('retains cutoff and other App/scope/store, deletes many small batches, and retries safely', async () => {
      const f = await fixture();
      const otherDb = await fixture('other');
      const s = await setup(f);
      const now = Date.UTC(2026, 8, 6);
      vi.spyOn(Date, 'now').mockReturnValue(now);
      const cutoff = new Date(now - 180 * 86400000).toISOString();
      await seed(f.store, 7);
      await seed(f.store, 1, cutoff);
      await seed(f.store, 1, '2099-01-01T00:00:00.000Z');
      for (const binding of [
        { appId: 'other-app', store: 'main' },
        { appId: f.scope.appId, securityScope: 'other-scope', store: 'main' },
      ]) {
        const other = new PortableAuditStore(f.connection, binding);
        await other.prepare();
        await seed(other, 2);
      }
      await seed(otherDb.store, 2);
      await auditRaw(
        f.connection,
        'CREATE TABLE "syntheticBusiness" ("id" INTEGER PRIMARY KEY)',
      );
      await auditRaw(
        f.connection,
        'INSERT INTO "syntheticBusiness" ("id") VALUES (1)',
      );
      const result = await s.service.run();
      expect(result).toMatchObject({
        status: 'completed',
        deleted: 7,
        batches: 4,
        cutoff,
        revision: 1,
      });
      expect(await originalCount(f)).toBe(6);
      expect(await originalCount(otherDb)).toBe(2);
      expect(
        (await auditRows(f.connection, 'SELECT "id" FROM "syntheticBusiness"'))
          .length,
      ).toBe(1);
      const retry = await s.service.run();
      expect(retry).toMatchObject({ status: 'completed', deleted: 0 });
      const summaries = (
        await f.store.query(f.scope, { store: 'main', pageSize: 100 })
      ).items.filter((e) => e.producer === 'audit.retention');
      expect(
        summaries.filter((e) => e.action === 'audit.cleanup'),
      ).toHaveLength(2);
      expect(
        summaries
          .filter((e) => e.action === 'audit.cleanup.batch')
          .reduce((n, e) => n + Number(e.details?.deleted), 0),
      ).toBe(7);
      expect(JSON.stringify([summaries, s.diagnostics])).not.toContain(
        'RETENTION-SYNTHETIC-RAW-CONTENT',
      );
      expect(JSON.stringify([summaries, s.diagnostics])).not.toContain(
        'synthetic.secret.action',
      );
      expect(
        s.health.get().coverage.find((c) => c.producer === 'audit.retention'),
      ).toMatchObject({ observed: true });
    });

    it('reflects not-run, no events, null and disabled without deleting history or resetting settings', async () => {
      const f = await fixture();
      const s = await setup(f);
      expect(s.service.observe()).toEqual({ state: 'not-run' });
      expect(await s.service.run()).toMatchObject({
        status: 'completed',
        deleted: 0,
      });
      await seed(f.store, 3);
      let current = await s.settings.get(f.scope);
      current = await s.settings.update(f.scope, {
        expectedRevision: current.revision,
        settings: { ...current, retentionDays: null },
        confirmRetentionReduction: false,
      });
      expect(await s.service.run()).toMatchObject({
        status: 'no-auto-delete',
        deleted: 0,
      });
      current = await s.settings.update(f.scope, {
        expectedRevision: current.revision,
        settings: { ...current, enabled: false },
        confirmRetentionReduction: false,
      });
      expect(await s.service.run()).toMatchObject({
        status: 'disabled',
        deleted: 0,
      });
      const restarted = await setup(f, { retentionDays: 1, enabled: true });
      expect(await restarted.settings.get(f.scope)).toEqual(current);
      expect(await originalCount(f)).toBe(3);
    });

    it('bounds each invocation and resumes remaining rows on another delivery', async () => {
      const f = await fixture();
      const s = await setup(f, {}, 2, 2);
      await seed(f.store, 7);
      expect(await s.service.run()).toMatchObject({
        status: 'bounded',
        deleted: 4,
        batches: 2,
      });
      expect(await s.service.run()).toMatchObject({
        status: 'completed',
        deleted: 3,
        batches: 2,
      });
      expect(await originalCount(f)).toBe(0);
    });

    it('concurrent services report locked committed rows and recover only proven deadlocks', async () => {
      const f = await fixture();
      const s = await setup(f);
      await seed(f.store, 13);
      const second = new AuditRetentionService(s.options);
      const plan = await s.service.plan();
      expect(plan).toBeDefined();
      const codes: string[] = [];
      const client = await f.connection.client<{
        on(event: string, listener: (error: unknown) => void): void;
        removeListener(event: string, listener: (error: unknown) => void): void;
      }>();
      const observeError = (error: unknown): void => {
        codes.push(
          error !== null &&
            typeof error === 'object' &&
            'code' in error &&
            typeof error.code === 'string'
            ? error.code
            : 'unknown',
        );
      };
      client.on('query-error', observeError);
      const attempts = await Promise.allSettled([
        s.service.run(plan),
        second.run(plan),
      ]);
      client.removeListener('query-error', observeError);
      const completed = attempts.flatMap((attempt) =>
        attempt.status === 'fulfilled' ? [attempt.value] : [],
      );
      const rejected = attempts.filter(
        (attempt) => attempt.status === 'rejected',
      );
      if (rejected.length) {
        expect(dialect).toBe('mysql');
        expect(codes).toHaveLength(rejected.length);
        expect(codes.every((code) => code === 'ER_LOCK_DEADLOCK')).toBe(true);
        for (const attempt of rejected)
          expect(attempt.reason).toMatchObject({ code: 'AUDIT_WRITE_FAILED' });
        // Both original attempts have settled before retry or fixture disposal.
        // A rejected attempt can already have committed earlier short batches.
        completed.push(await s.service.run(plan));
      } else expect(codes).toEqual([]);
      expect(await originalCount(f)).toBe(0);
      const events = (
        await f.store.query(f.scope, { store: 'main', pageSize: 100 })
      ).items;
      const summaries = events.filter(
        (event) => event.action === 'audit.cleanup',
      );
      const batches = events.filter(
        (event) => event.action === 'audit.cleanup.batch',
      );
      expect(
        batches.reduce(
          (count, event) => count + Number(event.details?.deleted),
          0,
        ),
      ).toBe(13);
      expect(summaries).toHaveLength(completed.length);
      for (const result of completed) {
        const summary = summaries.find(
          (event) => event.runId === result.attemptId,
        );
        expect(summary?.details?.deleted).toBe(result.deleted);
        expect(
          batches
            .filter((event) => event.runId === result.attemptId)
            .reduce(
              (count, event) => count + Number(event.details?.deleted),
              0,
            ),
        ).toBe(result.deleted);
      }
      if (!rejected.length)
        expect(
          completed.reduce((count, result) => count + result.deleted, 0),
        ).toBe(13);
    });

    it('real SQL batch-summary failure rolls back deletion and retry commits once', async () => {
      const f = await fixture();
      const s = await setup(f);
      await seed(f.store, 3);
      // A real database constraint fails only retention summaries, after DELETE has executed.
      if (dialect === 'sqlite')
        await auditRaw(
          f.connection,
          `CREATE TRIGGER "retention_fail" BEFORE INSERT ON "auditEvents" WHEN NEW."producer" = 'audit.retention' BEGIN SELECT RAISE(ABORT, 'RETENTION-SYNTHETIC-SECRET-FAULT'); END`,
        );
      else
        await auditRaw(
          f.connection,
          `ALTER TABLE "auditEvents" ADD CONSTRAINT "retention_fail" CHECK ("producer" <> 'audit.retention')`,
        );
      await expect(s.service.run()).rejects.toMatchObject({
        code: 'AUDIT_WRITE_FAILED',
      });
      expect(await originalCount(f)).toBe(3);
      expect(s.service.observe().state).toBe('failed');
      expect(s.health.get().state).toBe('degraded');
      expect(JSON.stringify(s.diagnostics)).not.toContain(
        'RETENTION-SYNTHETIC-SECRET-FAULT',
      );
      if (dialect === 'sqlite')
        await auditRaw(f.connection, 'DROP TRIGGER "retention_fail"');
      else
        await auditRaw(
          f.connection,
          'ALTER TABLE "auditEvents" DROP CONSTRAINT "retention_fail"',
        );
      expect(await s.service.run()).toMatchObject({
        status: 'completed',
        deleted: 3,
      });
    });

    it('final-summary failure never claims successful completion after committed batches', async () => {
      const f = await fixture();
      const s = await setup(f);
      await seed(f.store, 3);
      if (dialect === 'sqlite')
        await auditRaw(
          f.connection,
          `CREATE TRIGGER "retention_final_fail" BEFORE INSERT ON "auditEvents" WHEN NEW."action" = 'audit.cleanup' BEGIN SELECT RAISE(ABORT, 'RETENTION-FINAL-FAULT'); END`,
        );
      else
        await auditRaw(
          f.connection,
          `ALTER TABLE "auditEvents" ADD CONSTRAINT "retention_final_fail" CHECK ("action" <> 'audit.cleanup')`,
        );
      await expect(s.service.run()).rejects.toMatchObject({
        code: 'AUDIT_WRITE_FAILED',
      });
      expect(await originalCount(f)).toBe(0);
      expect(s.service.observe().state).toBe('failed');
      const batches = (
        await f.store.query(f.scope, { store: 'main', pageSize: 100 })
      ).items.filter((e) => e.action === 'audit.cleanup.batch');
      expect(batches.reduce((n, e) => n + Number(e.details?.deleted), 0)).toBe(
        3,
      );
      expect(
        s.health.get().coverage.find((c) => c.producer === 'audit.retention')
          ?.lastSuccessAt,
      ).toBeUndefined();
    });

    it('rejects zero retention, missing confirmation, stale revision, and invalid batch bounds', async () => {
      const f = await fixture();
      const s = await setup(f);
      const current = await s.settings.get(f.scope);
      await expect(
        s.settings.update(f.scope, {
          expectedRevision: 1,
          settings: { ...current, retentionDays: 0 },
          confirmRetentionReduction: true,
        }),
      ).rejects.toThrow();
      await expect(
        s.settings.update(f.scope, {
          expectedRevision: 1,
          settings: { ...current, retentionDays: 1 },
          confirmRetentionReduction: false,
        }),
      ).rejects.toMatchObject({ code: 'AUDIT_POLICY_CONFLICT' });
      await s.settings.update(f.scope, {
        expectedRevision: 1,
        settings: { ...current, retentionDays: 1 },
        confirmRetentionReduction: true,
      });
      await expect(
        s.settings.update(f.scope, {
          expectedRevision: 1,
          settings: current,
          confirmRetentionReduction: true,
        }),
      ).rejects.toMatchObject({ code: 'AUDIT_POLICY_CONFLICT' });
      expect(
        () => new AuditRetentionService({ ...s.options, batchSize: 1001 }),
      ).toThrow();
      expect(
        () => new AuditRetentionService({ ...s.options, maxBatches: 0 }),
      ).toThrow();
      const settingsEvents = (
        await f.store.query(f.scope, { store: 'main', pageSize: 100 })
      ).items.filter((e) => e.action === 'audit.settings.update');
      expect(settingsEvents[0].details).toEqual({
        previousRevision: 1,
        revision: 2,
      });
    });

    it('rejects same-name different physical connections and settings Store identities', async () => {
      const f = await fixture();
      const other = await fixture();
      const s = await setup(f);
      await seed(f.store, 2);
      await seed(other.store, 2);
      const bad = new AuditRetentionService({
        ...s.options,
        connection: other.connection,
      });
      await expect(bad.run()).rejects.toMatchObject({
        code: 'AUDIT_TRANSACTION_MISMATCH',
      });
      const copied = new PortableAuditStore(f.connection, f.store.binding);
      await copied.prepare();
      expect(
        () =>
          new AuditRetentionService({
            ...s.options,
            configurationStore: copied,
          }),
      ).toThrow();
      expect(await originalCount(f)).toBe(2);
      expect(await originalCount(other)).toBe(2);
    });

    it('reports unavailable storage rather than an empty successful run', async () => {
      const f = await fixture();
      const s = await setup(f);
      await auditRaw(
        f.connection,
        'ALTER TABLE "auditEvents" RENAME TO "retention_unavailable_events"',
      );
      await expect(s.service.run()).rejects.toThrow();
      expect(s.service.observe().state).toBe('failed');
      expect(s.health.get().state).toBe('degraded');
    });
    it('retry retains the same scheduling cutoff even after time advances', async () => {
      const f = await fixture();
      const s = await setup(f, {}, 1, 1);
      const now = Date.UTC(2026, 8, 6);
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
      const plan = await s.service.plan();
      const boundary = new Date(now - 180 * 86400000).toISOString();
      await seed(f.store, 2);
      await seed(f.store, 1, boundary);
      expect(await s.service.run(plan)).toMatchObject({
        status: 'bounded',
        deleted: 1,
      });
      clock.mockReturnValue(now + 86400000);
      expect(await s.service.run(plan)).toMatchObject({
        status: 'bounded',
        deleted: 1,
      });
      expect(await s.service.run(plan)).toMatchObject({
        status: 'completed',
        deleted: 0,
      });
      expect(await originalCount(f)).toBe(1);
      expect(await s.service.run()).toMatchObject({ deleted: 1 });
    });

    it('stop drains the real open batch transaction and admits no new cleanup', async () => {
      const f = await fixture();
      const s = await setup(f, {}, 1, 100);
      await seed(f.store, 3);
      let enter!: () => void;
      let release!: () => void;
      const entered = new Promise<void>((done) => {
        enter = done;
      });
      const gate = new Promise<void>((done) => {
        release = done;
      });
      const original = f.store.appendWithLimits.bind(f.store);
      const spy = vi
        .spyOn(f.store, 'appendWithLimits')
        .mockImplementation(async (event, options, limits) => {
          if (event.action === 'audit.cleanup.batch') {
            enter();
            await gate;
          }
          return original(event, options, limits);
        });
      const running = s.service.run();
      await entered;
      let drained = false;
      const disposing = s.service.dispose().then(() => {
        drained = true;
      });
      await expect(s.service.run()).rejects.toMatchObject({
        code: 'AUDIT_NOT_READY',
      });
      expect(drained).toBe(false);
      release();
      expect(await running).toMatchObject({
        status: 'stopped',
        deleted: 1,
        batches: 1,
      });
      await disposing;
      spy.mockRestore();
      expect(await originalCount(f)).toBe(2);
      expect(await auditRows(f.connection, 'SELECT 1 AS ok')).toHaveLength(1);
    });
    it('different data-source cleanup uses the exact shared configuration Store outside its transaction', async () => {
      const f = await fixture();
      const target = await fixture('secondary');
      const s = await setup(f);
      await seed(f.store, 2);
      await seed(target.store, 3);
      const service = new AuditRetentionService({
        ...s.options,
        connection: target.connection,
        store: target.store,
      });
      expect(await service.run()).toMatchObject({ deleted: 3 });
      expect(await originalCount(f)).toBe(2);
      expect(await originalCount(target)).toBe(0);
    });

    it('binary ID ordering does not skip case-sensitive IDs sharing a timestamp', async () => {
      const f = await fixture();
      const s = await setup(f, {}, 1, 100);
      for (const id of ['A', 'a', 'B', 'b']) {
        const { event } = normalizeEvent(
          { action: 'synthetic.case', outcome: 'success' },
          {
            scope: f.scope,
            kind: 'business',
            producer: 'synthetic-runtime',
            id,
            occurredAt: '2000-01-01T00:00:00.000Z',
            recordedAt: '2000-01-01T00:00:00.000Z',
            store: 'main',
            policyVersion: 1,
          },
        );
        await f.store.append(event);
      }
      expect(await s.service.run()).toMatchObject({
        deleted: 4,
        status: 'completed',
      });
      expect(await originalCount(f)).toBe(0);
    });
  });
