import { describe, expect, it } from 'vitest';
import { AuditCaptureCatalog } from '../../server/capture-catalog.js';
import { LocalAuditHealthService } from '../../server/health-service.js';
import { AuditReadiness } from '../../server/providers/readiness.js';
import { PersistentAuditSettingsService } from '../../server/settings-service.js';
import { createAuditDatabaseCollector } from '../../server/providers/database.js';
import { NodeAuditScopeCarrier } from '../../server/scope.js';
import type { AuditDatabaseCollector } from '../../server/database-collector.js';
import {
  auditRaw,
  auditRows,
  createPortableFixture,
  dialects,
} from '../helpers/database-fixtures.js';
import { observeSqlCost } from '../helpers/performance-observer.js';

const modes = ['disabled', 'enabled-miss', 'enabled-hit'] as const;

for (const dialect of dialects) {
  describe('audit SQL and connection usage ' + dialect, () => {
    it('preserves writes without old-row reads or leaked connections when capture is disabled, excluded or enabled', async () => {
      const f = await createPortableFixture(dialect);
      let collector: AuditDatabaseCollector | undefined;
      try {
        for (const table of ['audit_perf_rows', 'audit_perf_excluded']) {
          await auditRaw(
            f.connection,
            'CREATE TABLE "' +
              table +
              '" ("id" INTEGER PRIMARY KEY, "value" INTEGER NOT NULL)',
          );
        }
        const targets = ['audit_perf_rows', 'audit_perf_excluded'].map(
          (table) => ({
            dataSource: f.connection.name,
            table,
          }),
        );
        const scope = new NodeAuditScopeCarrier(f.scope.appId);
        const catalog = new AuditCaptureCatalog();
        const health = new LocalAuditHealthService(() => undefined);
        const readiness = new AuditReadiness({
          stores: [{ connection: f.connection, store: f.store }],
          catalog,
          health,
          requirements: {
            auditRequired: false,
            requiredDataSources: [],
            mandatorySources: [],
          },
        });
        const settings = new PersistentAuditSettingsService({
          connection: f.connection,
          store: f.store,
          readiness,
          health,
          defaults: {
            enabled: false,
            sources: {
              http: 'disabled',
              runtime: 'disabled',
              database: targets,
            },
          },
        });
        await settings.initialize(f.scope);
        collector = await createAuditDatabaseCollector({
          connection: f.connection,
          store: f.store,
          configurationStore: f.store,
          scope,
          catalog,
          health,
          settings,
          targets,
        });
        expect(await readiness.start(await settings.get(f.scope))).toBe(false);
        for (const mode of modes) {
          const current = await settings.get(f.scope);
          const next = await settings.update(f.scope, {
            expectedRevision: current.revision,
            confirmRetentionReduction: false,
            settings: {
              ...current,
              enabled: mode !== 'disabled',
              sources: {
                ...current.sources,
                database: [targets[mode === 'enabled-miss' ? 1 : 0]!],
              },
            },
          });
          expect(await readiness.start(next)).toBe(mode !== 'disabled');
          await auditRaw(f.connection, 'DELETE FROM "auditEvents"');
          const observer = await observeSqlCost(f.connection);
          let observed: ReturnType<typeof observer.stop>;
          try {
            await scope.run(f.scope, async () => {
              expect(
                await f.connection.query
                  .insertInto('audit_perf_rows')
                  .values({ id: 1, value: 987654321 })
                  .execute(),
              ).toMatchObject({ insertedCount: 1 });
              expect(
                await f.connection.query
                  .updateTable('audit_perf_rows')
                  .set({ value: 123456789 })
                  .where('id', '=', 1)
                  .execute(),
              ).toMatchObject({ updatedCount: 1 });
              expect(
                await f.connection.query
                  .deleteFrom('audit_perf_rows')
                  .where('id', '=', 1)
                  .execute(),
              ).toMatchObject({ deletedCount: 1 });
            });
          } finally {
            observed = observer.stop();
          }
          expect(observed.sql['business.select'] ?? 0).toBe(0);
          for (const operation of ['insert', 'update', 'delete'])
            expect(observed.sql['business.' + operation]).toBe(1);
          expect(observed.sql['business.other'] ?? 0).toBe(0);
          expect(observed.sql['events.insert'] ?? 0).toBe(
            mode === 'enabled-hit' ? 3 : 0,
          );
          expect(observed.sql['settings.select']).toBeGreaterThan(0);
          expect(observed.pool.acquired).toBeGreaterThan(0);
          expect(observed.pool.released).toBe(observed.pool.acquired);
          expect(observed.pool.idle).toBe(true);
          expect(
            await auditRows(
              f.connection,
              'SELECT "id", "value" FROM "audit_perf_rows" ORDER BY "id"',
            ),
          ).toEqual([]);
          const events = (
            await f.store.query(f.scope, {
              store: f.connection.name,
              kind: 'database',
              pageSize: 100,
            })
          ).items;
          expect(events).toHaveLength(mode === 'enabled-hit' ? 3 : 0);
          expect(events.map((event) => event.action).sort()).toEqual(
            mode === 'enabled-hit'
              ? ['database.delete', 'database.insert', 'database.update']
              : [],
          );
          const serialized = JSON.stringify(events);
          expect(
            serialized.includes('987654321') ||
              serialized.includes('123456789'),
          ).toBe(false);
        }
      } finally {
        try {
          await collector?.dispose();
        } finally {
          await f.cleanup();
        }
      }
    });
  });
}
