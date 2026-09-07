import { afterEach, describe, expect, it } from 'vitest';
import { AuditCaptureCatalog } from '../../server/capture-catalog.js';
import {
  LocalAuditHealthService,
  type AuditHealthDiagnostic,
} from '../../server/health-service.js';
import { AuditReadiness } from '../../server/providers/readiness.js';
import { PersistentAuditSettingsService } from '../../server/settings-service.js';
import { PortableAuditStore } from '../../server/store.js';
import type {
  AuditDeploymentRequirements,
  AuditSettings,
} from '../../server/contracts.js';
import {
  createPortableFixture,
  dialects,
  auditRaw,
  auditRows,
  type PortableFixture,
} from '../helpers/database-fixtures.js';

const optional: AuditDeploymentRequirements = {
  auditRequired: false,
  mandatorySources: [],
  requiredDataSources: [],
};
const fixtures: PortableFixture[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});
function assembly(
  f: PortableFixture,
  requirements: AuditDeploymentRequirements = optional,
  defaults?: Partial<Omit<AuditSettings, 'revision'>>,
) {
  const diagnostics: AuditHealthDiagnostic[] = [];
  const health = new LocalAuditHealthService(
    (event) => diagnostics.push(event),
    'synthetic-instance',
  );
  const catalog = new AuditCaptureCatalog();
  const readiness = new AuditReadiness({
    stores: [{ connection: f.connection, store: f.store }],
    catalog,
    health,
    requirements,
  });
  const settings = new PersistentAuditSettingsService({
    connection: f.connection,
    store: f.store,
    readiness,
    health,
    defaults,
  });
  return { health, catalog, readiness, settings, diagnostics };
}
async function runtime(f: PortableFixture, catalog: AuditCaptureCatalog) {
  const handle = catalog.register({
    producer: 'synthetic-runtime',
    kind: 'business',
    connection: f.connection,
    targets: [],
    dispose: () => undefined,
  });
  let receipt: Awaited<ReturnType<typeof f.recorder.record>> | undefined;
  await handle.verify(async () => {
    receipt = await f.recorder.record({
      action: 'synthetic.probe',
      outcome: 'success',
    });
  });
  expect(receipt?.state).toBe('committed');
  return handle;
}
const enabled: Partial<Omit<AuditSettings, 'revision'>> = {
  enabled: true,
  sources: { http: 'disabled', runtime: 'integrated-producers', database: [] },
};

for (const dialect of dialects)
  describe('persistent settings ' + dialect, () => {
    async function fixture(migrate = true) {
      const f = await createPortableFixture(dialect, migrate);
      fixtures.push(f);
      return f;
    }

    it('concurrent CAS across independent services commits one policy and one audit fact', async () => {
      const f = await fixture();
      const a = assembly(f);
      const b = assembly(f);
      const current = await a.settings.initialize(f.scope);
      await expect(
        a.settings.get({ ...f.scope, appId: 'other-app' }),
      ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
      await expect(
        a.settings.update(f.scope, {
          expectedRevision: current.revision,
          settings: { ...current, observationStore: 'absent' },
          confirmRetentionReduction: false,
        }),
      ).rejects.toMatchObject({ code: 'AUDIT_TARGET_UNSUPPORTED' });
      expect(await a.settings.get(f.scope)).toEqual(current);
      expect((await f.store.query(f.scope, { store: 'main' })).items).toEqual(
        [],
      );
      const results = await Promise.allSettled(
        [a, b].map(({ settings }, index) =>
          settings.update(f.scope, {
            expectedRevision: current.revision,
            settings: { ...current, retentionDays: 200 + index },
            confirmRetentionReduction: false,
          }),
        ),
      );
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected).toMatchObject({
        status: 'rejected',
        reason: { code: 'AUDIT_POLICY_CONFLICT' },
      });
      const stored = await b.settings.get(f.scope);
      expect(stored.revision).toBe(2);
      expect([200, 201]).toContain(stored.retentionDays);
      const events = await f.store.query(f.scope, { store: 'main' });
      expect(events.items).toHaveLength(1);
      expect(events.items[0]).toMatchObject({
        action: 'audit.settings.update',
        policyVersion: 2,
        actor: f.scope.actor,
      });
    });

    it('restart preserves null retention and requires confirmation before a finite policy', async () => {
      const f = await fixture();
      const a = assembly(f);
      const current = await a.settings.initialize(f.scope);
      expect(current.retentionDays).toBe(180);
      await a.settings.update(f.scope, {
        expectedRevision: 1,
        settings: { ...current, retentionDays: null },
        confirmRetentionReduction: false,
      });
      const restarted = assembly(f, optional, {
        retentionDays: 3,
        enabled: true,
      });
      expect(await restarted.settings.initialize(f.scope)).toMatchObject({
        revision: 2,
        enabled: false,
        retentionDays: null,
      });
      await expect(
        restarted.settings.update(f.scope, {
          expectedRevision: 2,
          settings: { ...current, retentionDays: 10 },
          confirmRetentionReduction: false,
        }),
      ).rejects.toMatchObject({ code: 'AUDIT_POLICY_CONFLICT' });
      expect((await restarted.settings.get(f.scope)).revision).toBe(2);
      const after = await restarted.settings.update(f.scope, {
        expectedRevision: 2,
        settings: { ...current, retentionDays: 10 },
        confirmRetentionReduction: true,
      });
      expect(after.retentionDays).toBe(10);
    });

    it('required startup rejects missing migration and missing required database collector', async () => {
      const bare = await fixture(false);
      const required = {
        auditRequired: true,
        mandatorySources: ['database'] as const,
        requiredDataSources: ['main'],
      };
      const defaults = {
        enabled: true,
        sources: {
          http: 'disabled' as const,
          runtime: 'disabled' as const,
          database: [{ dataSource: 'main', table: 'orders' }],
        },
      };
      const absent = assembly(bare, required, defaults);
      const policy: AuditSettings = {
        revision: 1,
        observationStore: 'main',
        retentionDays: 180,
        maxDetailsBytes: 65536,
        ...defaults,
      };
      await expect(absent.readiness.start(policy)).rejects.toMatchObject({
        code: 'AUDIT_NOT_READY',
      });
      const f = await fixture();
      const a = assembly(f, required, defaults);
      const settings = await a.settings.initialize(f.scope);
      await expect(a.readiness.start(settings)).rejects.toMatchObject({
        code: 'AUDIT_NOT_READY',
      });
      await expect(
        a.settings.update(f.scope, {
          expectedRevision: 1,
          settings: { ...settings, enabled: false },
          confirmRetentionReduction: false,
        }),
      ).rejects.toMatchObject({ code: 'AUDIT_POLICY_CONFLICT' });
    });

    it('optional missing coverage returns an explicitly disabled execution policy and partial health', async () => {
      const f = await fixture();
      const a = assembly(f, optional, enabled);
      await a.settings.initialize(f.scope);
      const snapshot = await a.settings.snapshot(f.scope);
      expect(snapshot.enabled).toBe(false);
      expect(a.health.get().state).toBe('partial-coverage');
      await runtime(f, a.catalog);
      expect(await a.readiness.start(await a.settings.get(f.scope))).toBe(true);
      expect(a.health.get().state).toBe('ready-no-events');
    });

    it('database read/write outage stays visible locally without exposing underlying errors', async () => {
      const f = await fixture();
      const a = assembly(f);
      const current = await a.settings.initialize(f.scope);
      await auditRaw(f.connection, 'DROP TABLE "auditEvents"');
      await expect(
        a.settings.update(f.scope, {
          expectedRevision: 1,
          settings: { ...current, retentionDays: 200 },
          confirmRetentionReduction: false,
        }),
      ).rejects.toMatchObject({ code: 'AUDIT_WRITE_FAILED' });
      expect((await a.settings.get(f.scope)).revision).toBe(1);
      await auditRaw(f.connection, 'DROP TABLE "auditSettings"');
      await expect(a.settings.get(f.scope)).rejects.toMatchObject({
        code: 'AUDIT_WRITE_FAILED',
      });
      expect(a.health.observe()).toMatchObject({
        state: 'degraded',
        observation: 'local',
        scope: 'current-instance-only',
        dataSources: ['main'],
      });
      expect(JSON.stringify(a.diagnostics)).not.toContain('SELECT');
      expect(JSON.stringify(a.diagnostics)).not.toContain('DROP');
    });
  });

for (const dialect of dialects)
  describe('physical capabilities ' + dialect, () => {
    it('unverified registration is not ready; verified physical binding protects mandatory targets and generation disposal', async () => {
      const f = await createPortableFixture(dialect);
      fixtures.push(f);
      const target = { dataSource: 'main', table: 'synthetic_orders' };
      await auditRaw(
        f.connection,
        'CREATE TABLE "synthetic_orders" ("id" INTEGER PRIMARY KEY)',
      );
      const requirements: AuditDeploymentRequirements = {
        auditRequired: true,
        mandatorySources: ['database'],
        requiredDataSources: ['main'],
      };
      const a = assembly(f, requirements, {
        enabled: true,
        sources: { http: 'disabled', runtime: 'disabled', database: [target] },
      });
      let disposed = 0;
      const registered = a.catalog.register({
        producer: 'synthetic-db',
        kind: 'database',
        connection: f.connection,
        targets: [target],
        dispose: () => {
          disposed++;
        },
      });
      const current = await a.settings.initialize(f.scope);
      expect(a.catalog.entries(current)[0]).toMatchObject({
        configured: true,
        live: true,
        verified: false,
      });
      await expect(a.readiness.start(current)).rejects.toMatchObject({
        code: 'AUDIT_NOT_READY',
      });
      await registered.verify(async () => {
        await auditRows(
          f.connection,
          'SELECT "id" FROM "synthetic_orders" LIMIT 0',
        );
      });
      expect(await a.readiness.start(current)).toBe(true);
      expect(a.catalog.entries(current)[0]?.verified).toBe(true);
      await expect(
        a.settings.update(f.scope, {
          expectedRevision: 1,
          settings: {
            ...current,
            sources: {
              ...current.sources,
              database: [{ ...target, table: 'other_table' }],
            },
          },
          confirmRetentionReduction: false,
        }),
      ).rejects.toMatchObject({ code: 'AUDIT_POLICY_CONFLICT' });
      await expect(
        a.settings.update(f.scope, {
          expectedRevision: 1,
          settings: {
            ...current,
            sources: {
              ...current.sources,
              database: [target, { ...target, table: 'unsupported' }],
            },
          },
          confirmRetentionReduction: false,
        }),
      ).rejects.toMatchObject({ code: 'AUDIT_NOT_READY' });
      const replacement = a.catalog.register({
        producer: 'synthetic-db',
        kind: 'database',
        connection: f.connection,
        targets: [target],
        dispose: () => {
          disposed++;
        },
      });
      await replacement.verify(async () => {
        await auditRows(
          f.connection,
          'SELECT "id" FROM "synthetic_orders" LIMIT 0',
        );
      });
      await registered.dispose();
      await registered.dispose();
      expect(disposed).toBe(1);
      expect(a.readiness.effective(current)).toBe(true);
      expect(replacement.generation).toBeGreaterThan(registered.generation);
      await a.catalog.dispose();
      await replacement.dispose();
      expect(disposed).toBe(2);
      expect(() => a.readiness.effective(current)).toThrow('AUDIT_NOT_READY');
      expect(
        a.health
          .get()
          .coverage.find((entry) => entry.producer === 'synthetic-db')
          ?.registered,
      ).toBe(false);
    });
  });

for (const dialect of dialects)
  describe('configuration store binding ' + dialect, () => {
    it('rejects foreign physical stores before initialization, readiness or mutation', async () => {
      const a = await createPortableFixture(dialect);
      fixtures.push(a);
      const b = await createPortableFixture(dialect);
      fixtures.push(b);
      const requirements: AuditDeploymentRequirements = {
        auditRequired: true,
        mandatorySources: ['business'],
        requiredDataSources: [],
      };
      const resources = assembly(a, requirements, enabled);
      await runtime(a, resources.catalog);
      const mismatch = new PersistentAuditSettingsService({
        connection: a.connection,
        store: b.store,
        readiness: resources.readiness,
        health: resources.health,
      });
      await expect(mismatch.initialize(a.scope)).rejects.toMatchObject({
        code: 'AUDIT_TRANSACTION_MISMATCH',
      });
      expect(
        await auditRows(a.connection, 'SELECT "revision" FROM "auditSettings"'),
      ).toEqual([]);
      const current = await resources.settings.initialize(a.scope);
      const readiness = new AuditReadiness({
        stores: [{ connection: a.connection, store: b.store }],
        catalog: resources.catalog,
        health: resources.health,
        requirements,
      });
      await expect(readiness.start(current)).rejects.toMatchObject({
        code: 'AUDIT_TRANSACTION_MISMATCH',
      });
      await expect(mismatch.get(a.scope)).rejects.toMatchObject({
        code: 'AUDIT_TRANSACTION_MISMATCH',
      });
      await expect(
        mismatch.update(a.scope, {
          expectedRevision: 1,
          settings: { ...current, retentionDays: 365 },
          confirmRetentionReduction: false,
        }),
      ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
      const another = new PortableAuditStore(a.connection, a.store.binding);
      await another.prepare();
      expect(() =>
        resources.settings.assertConfigurationStore(a.store),
      ).not.toThrow();
      for (const store of [b.store, another])
        expect(() =>
          resources.settings.assertConfigurationStore(store),
        ).toThrow('AUDIT_TRANSACTION_MISMATCH');
      expect(await resources.settings.get(a.scope)).toEqual(current);
      expect(await resources.readiness.start(current)).toBe(true);
    });

    it('R2 committed disable immediately updates health without waiting for another snapshot', async () => {
      const f = await createPortableFixture(dialect);
      fixtures.push(f);
      const a = assembly(f, optional, enabled);
      await runtime(f, a.catalog);
      const current = await a.settings.initialize(f.scope);
      await a.readiness.start(current);
      a.health.success('synthetic-runtime', 'main');
      expect(a.health.get().state).toBe('healthy');
      const changed = await a.settings.update(f.scope, {
        expectedRevision: 1,
        settings: { ...current, enabled: false },
        confirmRetentionReduction: false,
      });
      expect(changed).toMatchObject({ enabled: false, revision: 2 });
      expect(a.health.observe()).toMatchObject({ state: 'disabled' });
      expect(
        a.health
          .get()
          .coverage.find((entry) => entry.producer === 'synthetic-runtime')
          ?.configured,
      ).toBe(false);
      expect((await a.settings.get(f.scope)).enabled).toBe(false);
    });
  });
