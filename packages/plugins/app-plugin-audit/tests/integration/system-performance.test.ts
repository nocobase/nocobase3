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
import { observePerformance } from '../helpers/performance-observer.js';

const modes = ['disabled', 'enabled-miss', 'enabled-hit'] as const;
const cycles = 30;
const seedRows = 64;

for (const dialect of dialects) {
  describe('audit SQL and connection usage ' + dialect, () => {
    it('preserves writes without old-row reads or leaked connections when capture is disabled, excluded or enabled', async () => {
      const f = await createPortableFixture(dialect);
      let collector: AuditDatabaseCollector | undefined;
      try {
        for (const table of ['g22_perf_rows', 'g22_perf_excluded']) {
          await auditRaw(
            f.connection,
            'CREATE TABLE "' +
              table +
              '" ("id" INTEGER PRIMARY KEY, "value" INTEGER NOT NULL)',
          );
        }
        const targets = ['g22_perf_rows', 'g22_perf_excluded'].map((table) => ({
          dataSource: f.connection.name,
          table,
        }));
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
        const seed = Array.from({ length: seedRows }, (_, index) => ({
          id: index + 1,
          value: index + 1,
        }));
        const reset = async (): Promise<void> => {
          await auditRaw(f.connection, 'DELETE FROM "auditEvents"');
          await auditRaw(f.connection, 'DELETE FROM "g22_perf_rows"');
          for (const row of seed)
            await auditRaw(
              f.connection,
              'INSERT INTO "g22_perf_rows" ("id", "value") VALUES (?, ?)',
              [row.id, row.value],
            );
        };
        const operations = {
          insert: () =>
            f.connection.query
              .insertInto('g22_perf_rows')
              .values({ id: seedRows + 1, value: 987654321 })
              .execute(),
          update: () =>
            f.connection.query
              .updateTable('g22_perf_rows')
              .set({ value: 123456789 })
              .where('id', '=', seedRows + 1)
              .execute(),
          delete: () =>
            f.connection.query
              .deleteFrom('g22_perf_rows')
              .where('id', '=', seedRows + 1)
              .execute(),
        };
        const countFields = {
          insert: 'insertedCount',
          update: 'updatedCount',
          delete: 'deletedCount',
        } as const;
        // Verify that the observer detects an actual business SELECT.
        const calibration = await observePerformance(f.connection);
        try {
          await auditRows(f.connection, 'SELECT "id" FROM "g22_perf_rows"');
        } finally {
          expect(calibration.stop().sql['business.select']).toBe(1);
        }
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
          await reset();
          // Verify intermediate business state before checking collector SQL.
          // InsertResult normalizes input cardinality, so its count alone is not proof of insertion.
          await scope.run(f.scope, async () => {
            expect(await operations.insert()).toMatchObject({
              insertedCount: 1,
            });
            expect(
              await auditRows(
                f.connection,
                'SELECT "id", "value" FROM "g22_perf_rows" WHERE "id" = ?',
                [seedRows + 1],
              ),
            ).toEqual([{ id: seedRows + 1, value: 987654321 }]);
            expect(await operations.update()).toMatchObject({
              updatedCount: 1,
            });
            expect(
              await auditRows(
                f.connection,
                'SELECT "id", "value" FROM "g22_perf_rows" WHERE "id" = ?',
                [seedRows + 1],
              ),
            ).toEqual([{ id: seedRows + 1, value: 123456789 }]);
            expect(await operations.delete()).toMatchObject({
              deletedCount: 1,
            });
            expect(
              await auditRows(
                f.connection,
                'SELECT "id" FROM "g22_perf_rows" WHERE "id" = ?',
                [seedRows + 1],
              ),
            ).toEqual([]);
          });
          await reset();
          const observer = await observePerformance(f.connection);
          let observed: ReturnType<typeof observer.stop>;
          try {
            await scope.run(f.scope, async () => {
              for (let cycle = 0; cycle < cycles; cycle++) {
                for (const operation of [
                  'insert',
                  'update',
                  'delete',
                ] as const) {
                  const result = await operations[operation]();
                  expect(result).toMatchObject({
                    [countFields[operation]]: 1,
                  });
                }
              }
            });
          } finally {
            observed = observer.stop();
          }
          expect(observed.sql['business.select'] ?? 0).toBe(0);
          for (const operation of ['insert', 'update', 'delete'])
            expect(observed.sql['business.' + operation]).toBe(cycles);
          expect(observed.sql['business.other'] ?? 0).toBe(0);
          expect(observed.sql['events.insert'] ?? 0).toBe(
            mode === 'enabled-hit' ? cycles * 3 : 0,
          );
          expect(observed.sql['settings.select']).toBeGreaterThan(0);
          expect(observed.pool.acquired).toBeGreaterThan(0);
          expect(observed.pool.released).toBe(observed.pool.acquired);
          expect(observed.pool.after[0]).toBe(0);
          expect(observed.pool.after.slice(2)).toEqual([0, 0]);
          expect(observed.pool.peakUsed).toBeLessThanOrEqual(
            dialect === 'sqlite' ? 1 : 8,
          );
          expect(
            await auditRows(
              f.connection,
              'SELECT "id", "value" FROM "g22_perf_rows" ORDER BY "id"',
            ),
          ).toEqual(seed);
          const events = (
            await f.store.query(f.scope, {
              store: f.connection.name,
              kind: 'database',
              pageSize: 100,
            })
          ).items;
          expect(events).toHaveLength(mode === 'enabled-hit' ? cycles * 3 : 0);
          if (mode === 'enabled-hit') {
            expect(
              new Set(events.map((event) => event.database?.executionId)).size,
            ).toBe(cycles * 3);
            for (const operation of ['insert', 'update', 'delete'])
              expect(
                events.filter(
                  (event) => event.action === 'database.' + operation,
                ),
              ).toHaveLength(cycles);
            expect(
              events.every(
                (event) =>
                  event.policyVersion === next.revision &&
                  event.outcome === 'success' &&
                  event.target?.resource === 'g22_perf_rows',
              ),
            ).toBe(true);
          }
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
    }, 180_000);
  });
}
