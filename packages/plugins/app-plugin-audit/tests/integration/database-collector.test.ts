import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabaseManager,
  getManagedWriteRegistry,
  type ManagedWriteResult,
} from '@nocobase/db';
import { AuditCaptureCatalog } from '../../server/capture-catalog.js';
import { LocalAuditHealthService } from '../../server/health-service.js';
import { AuditReadiness } from '../../server/providers/readiness.js';
import { PersistentAuditSettingsService } from '../../server/settings-service.js';
import { createAuditDatabaseCollector } from '../../server/providers/database.js';
import { NodeAuditScopeCarrier } from '../../server/scope.js';
import type { AuditDatabaseCollector } from '../../server/database-collector.js';
import { normalizeEvent } from '../../server/event-normalizer.js';
import { PortableAuditStore } from '../../server/store.js';
import type { AuditTablePolicy } from '../../server/contracts.js';
import {
  createPortableFixture,
  dialects,
  auditRaw,
  auditRows,
  type PortableFixture,
} from '../helpers/database-fixtures.js';

const fixtures: PortableFixture[] = [];
const collectors: AuditDatabaseCollector[] = [];
afterEach(async () => {
  await Promise.all(
    collectors.splice(0).map((collector) => collector.dispose()),
  );
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});
for (const dialect of dialects)
  describe('database collector ' + dialect, () => {
    async function fixture(name = 'main') {
      const f = await createPortableFixture(dialect, true, name);
      fixtures.push(f);
      await auditRaw(
        f.connection,
        'CREATE TABLE "orders" ("id" INTEGER PRIMARY KEY, "value" INTEGER NOT NULL)',
      );
      await auditRaw(
        f.connection,
        'CREATE TABLE "excluded" ("id" INTEGER PRIMARY KEY)',
      );
      return f;
    }
    async function assembly(
      f: PortableFixture,
      configuration = f,
      required = true,
    ) {
      const targets: AuditTablePolicy[] = [
        { dataSource: f.connection.name, table: 'orders' },
      ];
      const scope = new NodeAuditScopeCarrier(f.scope.appId);
      const health = new LocalAuditHealthService(() => undefined);
      const catalog = new AuditCaptureCatalog();
      const stores = [...new Set([f, configuration])].map((entry) => ({
        connection: entry.connection,
        store: entry.store,
      }));
      const readiness = new AuditReadiness({
        stores,
        catalog,
        health,
        requirements: {
          auditRequired: required,
          requiredDataSources: required ? [f.connection.name] : [],
          mandatorySources: required ? ['database'] : [],
        },
      });
      const settings = new PersistentAuditSettingsService({
        connection: configuration.connection,
        store: configuration.store,
        readiness,
        health,
        defaults: {
          enabled: true,
          sources: { http: 'disabled', runtime: 'disabled', database: targets },
        },
      });
      await settings.initialize(f.scope);
      const options = {
        connection: f.connection,
        store: f.store,
        configurationStore: configuration.store,
        scope,
        health,
        catalog,
        settings,
        targets,
      };
      const collector = await createAuditDatabaseCollector(options);
      collectors.push(collector);
      expect(await readiness.start(await settings.get(f.scope))).toBe(true);
      return {
        collector,
        options,
        scope,
        settings,
        health,
        catalog,
        readiness,
      };
    }
    async function events(f: PortableFixture) {
      return (
        await f.store.query(f.scope, {
          store: f.connection.name,
          kind: 'database',
          pageSize: 100,
        })
      ).items;
    }

    it('R1 rejects a same-name foreign configuration Store before registration', async () => {
      const f = await fixture();
      const foreign = await fixture();
      const a = await assembly(f);
      await a.collector.dispose();
      let unexpected: AuditDatabaseCollector | undefined;
      try {
        await expect(
          createAuditDatabaseCollector({
            ...a.options,
            configurationStore: foreign.store,
          }).then((value) => {
            unexpected = value;
            return 'unexpected-success';
          }),
        ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
      } finally {
        await unexpected?.dispose();
      }
      expect(
        a.catalog
          .entries(await a.settings.get(f.scope))
          .some((entry) => entry.live),
      ).toBe(false);
      expect(await events(f)).toHaveLength(0);
      expect(await events(foreign)).toHaveLength(0);
    });

    it('A01/A04/A05 normal writes preserve results and safe exact summaries without recursion', async () => {
      const f = await fixture();
      const a = await assembly(f);
      let original: ManagedWriteResult | undefined;
      const remove = getManagedWriteRegistry(f.connection).register(
        async (descriptor, execute) => {
          const result = await execute(descriptor.connection);
          original = result;
          return result;
        },
      );
      const result = await f.manager
        .query()
        .insertInto('orders')
        .values([
          { id: 1, value: 91 },
          { id: 2, value: 92 },
        ])
        .execute();
      expect(result).toBe(original);
      remove();
      await f.connection.query
        .updateTable('orders')
        .set({ value: 93 })
        .where('id', '=', 0)
        .execute();
      await f.connection.query
        .deleteFrom('orders')
        .where('id', '=', 1)
        .execute();
      await f.connection.query
        .insertInto('excluded')
        .values({ id: 1 })
        .execute();
      await auditRaw(
        f.connection,
        'UPDATE "auditSettings" SET "revision" = ? WHERE "scopeHash" = ?',
        [99, 'does-not-exist'],
      );
      await auditRaw(f.connection, 'DELETE FROM "auditEvents" WHERE "id" = ?', [
        'does-not-exist',
      ]);
      const captured = await events(f);
      expect(captured).toHaveLength(3);
      expect(
        new Set(captured.map((event) => event.database?.executionId)).size,
      ).toBe(3);
      expect(
        captured.find((event) => event.action === 'database.update')?.database,
      ).toMatchObject({ count: 0, countSemantics: 'matched' });
      const inserted = captured.find(
        (event) => event.action === 'database.insert',
      );
      expect(inserted?.target?.key).toBeUndefined();
      if (inserted?.database?.countSemantics === 'unknown')
        expect(inserted.database.count).toBeUndefined();
      for (const event of captured) {
        expect(event.actor.type).toBe('unknown');
        expect(event.details).toBeUndefined();
        expect(event.policyVersion).toBe(1);
      }
      expect(a.health.get().coverage.some((entry) => entry.observed)).toBe(
        true,
      );
    });

    it('A02 outer catch, append failure, later throw and business failure cannot commit protected writes', async () => {
      const f = await fixture();
      await assembly(f);
      await expect(
        f.connection.transaction(async (connection) => {
          await connection.query
            .insertInto('orders')
            .values({ id: 1, value: 1 })
            .execute();
          throw new Error('synthetic later failure');
        }),
      ).rejects.toThrow('synthetic later failure');
      expect(await events(f)).toHaveLength(0);
      await auditRaw(
        f.connection,
        'ALTER TABLE "auditEvents" RENAME TO "unavailableEvents"',
      );
      await expect(
        f.connection.query
          .insertInto('orders')
          .values({ id: 2, value: 2 })
          .execute(),
      ).rejects.toMatchObject({ code: 'AUDIT_WRITE_FAILED' });
      await expect(
        f.connection.transaction(async (connection) => {
          await expect(
            connection.query
              .insertInto('orders')
              .values({ id: 3, value: 3 })
              .execute(),
          ).rejects.toMatchObject({ code: 'AUDIT_WRITE_FAILED' });
          return 'caught';
        }),
      ).rejects.toThrow('rollback-only');
      await auditRaw(
        f.connection,
        'ALTER TABLE "unavailableEvents" RENAME TO "auditEvents"',
      );
      expect(
        await auditRows(f.connection, 'SELECT * FROM "orders"'),
      ).toHaveLength(0);
      expect(await events(f)).toHaveLength(0);
      await f.connection.query
        .insertInto('orders')
        .values({ id: 4, value: 4 })
        .execute();
      await expect(
        f.connection.transaction(async (connection) => {
          await expect(
            connection.query
              .insertInto('orders')
              .values({ id: 4, value: 5 })
              .execute(),
          ).rejects.toThrow();
        }),
      ).rejects.toThrow();
      expect(await events(f)).toHaveLength(1);
    });

    it('A03 cached builder/child/reconnect capture current scope and policy; compile is inert', async () => {
      const f = await fixture();
      const cached = f.connection.query
        .insertInto('orders')
        .values({ id: 1, value: 1 });
      const a = await assembly(f);
      cached.compile();
      expect(await events(f)).toHaveLength(0);
      await a.scope.run(
        {
          ...f.scope,
          operationId: 'synthetic-operation',
          actor: { type: 'workflow', id: 'synthetic-wf' },
          initiator: f.scope.actor,
        },
        () => cached.execute(),
      );
      const first = (await events(f))[0];
      expect(first?.actor.type).toBe('workflow');
      expect(first?.initiator).toEqual(f.scope.actor);
      await f.connection.transaction(async (connection) => {
        await connection.query
          .updateTable('orders')
          .set({ value: 2 })
          .where('id', '=', 1)
          .execute();
      });
      await f.manager.reconnect();
      await f.connection.query
        .updateTable('orders')
        .set({ value: 3 })
        .where('id', '=', 1)
        .execute();
      const current = await a.settings.get(f.scope);
      await a.settings.update(f.scope, {
        expectedRevision: current.revision,
        settings: { ...current, maxDetailsBytes: 8192 },
        confirmRetentionReduction: false,
      });
      await f.connection.query
        .deleteFrom('orders')
        .where('id', '=', 0)
        .execute();
      expect(
        (await events(f)).map((event) => event.policyVersion).sort(),
      ).toEqual([1, 1, 1, 2]);
      await a.collector.dispose();
      expect(
        a.catalog
          .entries(await a.settings.get(f.scope))
          .some((entry) => entry.live),
      ).toBe(false);
      const restarted = await createAuditDatabaseCollector(a.options);
      collectors.push(restarted);
      await a.readiness.start(await a.settings.get(f.scope));
      await f.connection.query
        .deleteFrom('orders')
        .where('id', '=', 0)
        .execute();
      expect(await events(f)).toHaveLength(5);
    });

    it('A06 secondary source commits locally and observation store is not an implicit destination', async () => {
      const main = await fixture();
      const f = await fixture('secondary');
      await assembly(f, main);
      await f.connection.transaction(async (connection) => {
        await connection.query
          .insertInto('orders')
          .values({ id: 1, value: 1 })
          .execute();
      });
      expect(await events(main)).toHaveLength(0);
      expect(await events(f)).toHaveLength(1);
      expect((await events(f))[0]).toMatchObject({
        store: 'secondary',
        target: { dataSource: 'secondary', resource: 'orders' },
      });
      await expect(
        f.connection.transaction(async (connection) => {
          await connection.query
            .insertInto('orders')
            .values({ id: 2, value: 1 })
            .execute();
          throw new Error('secondary rollback');
        }),
      ).rejects.toThrow('secondary rollback');
      expect(await events(f)).toHaveLength(1);
    });

    it('A07 actual SQL sequence has no business-row SELECT or payload capture', async () => {
      const f = await fixture();
      await assembly(f);
      const queries: string[] = [];
      const client = await f.connection.client<{
        on(event: string, listener: (query: { sql: string }) => void): void;
        removeListener(
          event: string,
          listener: (query: { sql: string }) => void,
        ): void;
      }>();
      const listener = (query: { sql: string }) => queries.push(query.sql);
      client.on('query', listener);
      try {
        await f.connection.query
          .insertInto('orders')
          .values({ id: 1, value: 987654321 })
          .execute();
        await f.connection.query
          .updateTable('orders')
          .set({ value: 123456789 })
          .where('id', '=', 1)
          .execute();
        await f.connection.query
          .deleteFrom('orders')
          .where('id', '=', 1)
          .execute();
      } finally {
        client.removeListener('query', listener);
      }
      expect(
        queries.filter(
          (sql) => /^(insert|update|delete)/i.test(sql) && /orders/i.test(sql),
        ),
      ).toHaveLength(3);
      expect(
        queries.filter((sql) => /^select/i.test(sql) && /orders/i.test(sql)),
      ).toHaveLength(0);
      process.stdout.write(
        JSON.stringify({ dialect, sequence: queries }) + '\n',
      );
      const payload = JSON.stringify(await events(f));
      expect(payload).not.toContain('987654321');
      expect(payload).not.toContain('123456789');
    });
    it('A03 actual immutable clones use live enable/exclude policies and preserve in-flight revision', async () => {
      const f = await fixture();
      const a = await assembly(f, f, false);
      const base = f.connection.query.deleteFrom('orders').where('id', '=', 0);
      const clone = base.where('value', '=', 1);
      expect(clone).not.toBe(base);
      const first = await a.settings.get(f.scope);
      await a.settings.update(f.scope, {
        expectedRevision: first.revision,
        settings: { ...first, sources: { ...first.sources, database: [] } },
        confirmRetentionReduction: false,
      });
      await clone.execute();
      expect(await events(f)).toHaveLength(0);
      const excluded = await a.settings.get(f.scope);
      await a.settings.update(f.scope, {
        expectedRevision: excluded.revision,
        settings: { ...excluded, sources: first.sources },
        confirmRetentionReduction: false,
      });
      await clone.execute();
      expect((await events(f))[0]?.policyVersion).toBe(3);
      const before = await a.settings.get(f.scope);
      const remove = getManagedWriteRegistry(f.connection).register(
        async (descriptor, execute) => {
          if (descriptor.target.table === 'orders') {
            await auditRaw(
              descriptor.connection,
              'UPDATE "auditSettings" SET "revision" = ?, "settings" = ? WHERE "revision" = ?',
              [
                before.revision + 1,
                JSON.stringify({ ...before, revision: before.revision + 1 }),
                before.revision,
              ],
            );
          }
          return execute(descriptor.connection);
        },
      );
      await base.execute();
      remove();
      expect(
        (await events(f)).every((event) => event.policyVersion === 3),
      ).toBe(true);
      await clone.execute();
      expect((await events(f)).some((event) => event.policyVersion === 4)).toBe(
        true,
      );
    });

    it('A02 nested caught failure poisons ancestors and missing scope never becomes system', async () => {
      const f = await fixture();
      const a = await assembly(f);
      await auditRaw(
        f.connection,
        'ALTER TABLE "auditEvents" RENAME TO "unavailableEvents"',
      );
      await expect(
        f.connection.transaction(async (outer) => {
          await expect(
            outer.transaction(async (inner) => {
              await expect(
                inner.query
                  .insertInto('orders')
                  .values({ id: 1, value: 1 })
                  .execute(),
              ).rejects.toThrow();
            }),
          ).rejects.toThrow('rollback-only');
        }),
      ).rejects.toThrow('rollback-only');
      await auditRaw(
        f.connection,
        'ALTER TABLE "unavailableEvents" RENAME TO "auditEvents"',
      );
      expect(
        await auditRows(f.connection, 'SELECT * FROM "orders"'),
      ).toHaveLength(0);
      expect(await events(f)).toHaveLength(0);
      await expect(
        a.scope.run({ ...f.scope, securityScope: 'wrong-scope' }, () =>
          f.connection.query
            .insertInto('orders')
            .values({ id: 2, value: 2 })
            .execute(),
        ),
      ).rejects.toMatchObject({ code: 'AUDIT_TRANSACTION_MISMATCH' });
      expect(
        await auditRows(f.connection, 'SELECT * FROM "orders"'),
      ).toHaveLength(0);
    });

    it('A03 readiness refuses nonexistent physical targets, missing local schema, and probe retains existing rows', async () => {
      const f = await fixture();
      const a = await assembly(f);
      await f.connection.query
        .insertInto('orders')
        .values({ id: 1, value: 1 })
        .execute();
      await a.collector.dispose();
      const started = await createAuditDatabaseCollector(a.options);
      collectors.push(started);
      expect(
        await auditRows(f.connection, 'SELECT * FROM "orders"'),
      ).toHaveLength(1);
      expect(await events(f)).toHaveLength(1);
      await started.dispose();
      await expect(
        createAuditDatabaseCollector({
          ...a.options,
          targets: [{ dataSource: f.connection.name, table: 'missing_target' }],
        }),
      ).rejects.toMatchObject({ code: 'AUDIT_NOT_READY' });
      expect(
        a.catalog
          .entries(await a.settings.get(f.scope))
          .some((entry) => entry.live),
      ).toBe(false);
      await auditRaw(
        f.connection,
        'ALTER TABLE "auditEvents" RENAME TO "unavailableEvents"',
      );
      await expect(createAuditDatabaseCollector(a.options)).rejects.toThrow();
      await auditRaw(
        f.connection,
        'ALTER TABLE "unavailableEvents" RENAME TO "auditEvents"',
      );
    });

    it('A03/A06 new connection on the same manager remains locally atomic after explicit capability registration', async () => {
      const main = await fixture();
      const secondary = await fixture('secondary');
      const manager = createDatabaseManager({
        default: 'main',
        connections: { main: main.config, secondary: secondary.config },
      });
      const mainConnection = manager.connection();
      const mainStore = new PortableAuditStore(
        mainConnection,
        main.store.binding,
      );
      await mainStore.prepare();
      const callbackSources: string[] = [];
      const remove = getManagedWriteRegistry(mainConnection).register(
        (descriptor, execute) => {
          callbackSources.push(descriptor.connection.name);
          return execute(descriptor.connection);
        },
      );
      const secondConnection = manager.connection('secondary');
      const secondStore = new PortableAuditStore(
        secondConnection,
        secondary.store.binding,
      );
      await secondStore.prepare();
      const scope = new NodeAuditScopeCarrier(main.scope.appId);
      const health = new LocalAuditHealthService(() => undefined);
      const catalog = new AuditCaptureCatalog();
      const targets = [
        { dataSource: 'main', table: 'orders' },
        { dataSource: 'secondary', table: 'orders' },
      ];
      const readiness = new AuditReadiness({
        stores: [
          { connection: mainConnection, store: mainStore },
          { connection: secondConnection, store: secondStore },
        ],
        health,
        catalog,
        requirements: {
          auditRequired: true,
          requiredDataSources: ['main', 'secondary'],
          mandatorySources: ['database'],
        },
      });
      const settings = new PersistentAuditSettingsService({
        connection: mainConnection,
        store: mainStore,
        readiness,
        health,
        defaults: {
          enabled: true,
          sources: { http: 'disabled', runtime: 'disabled', database: targets },
        },
      });
      await settings.initialize(main.scope);
      const owned: AuditDatabaseCollector[] = [];
      try {
        for (const [connection, store] of [
          [mainConnection, mainStore],
          [secondConnection, secondStore],
        ] as const) {
          const collector = await createAuditDatabaseCollector({
            connection,
            store,
            configurationStore: mainStore,
            scope,
            health,
            catalog,
            settings,
            targets: targets.filter(
              (target) => target.dataSource === connection.name,
            ),
          });
          owned.push(collector);
        }
        expect(await readiness.start(await settings.get(main.scope))).toBe(
          true,
        );
        await manager
          .query()
          .insertInto('orders')
          .values({ id: 1, value: 1 })
          .execute();
        await manager.transaction(async (connection) => {
          await connection.query
            .insertInto('orders')
            .values({ id: 2, value: 2 })
            .execute();
        }, 'secondary');
        expect(
          (await mainStore.query(main.scope, { store: 'main' })).items,
        ).toHaveLength(1);
        expect(
          (await secondStore.query(main.scope, { store: 'secondary' })).items,
        ).toHaveLength(1);
        expect(callbackSources).toContain('secondary');
        await auditRaw(
          secondConnection,
          'ALTER TABLE "auditEvents" RENAME TO "unavailableEvents"',
        );
        await expect(
          manager
            .query('secondary')
            .insertInto('orders')
            .values({ id: 3, value: 3 })
            .execute(),
        ).rejects.toThrow();
        expect(
          await auditRows(secondConnection, 'SELECT * FROM "orders"'),
        ).toHaveLength(1);
      } finally {
        await Promise.all(owned.map((collector) => collector.dispose()));
        remove();
        await manager.destroy();
      }
    });
    it('A01 correlated request and database facts survive independently with concurrent trusted scopes', async () => {
      const f = await fixture();
      const a = await assembly(f);
      await Promise.all(
        [1, 2].map((id) =>
          a.scope.run(
            {
              ...f.scope,
              actor: { type: 'user', id: 'synthetic-' + id },
              operationId: 'synthetic-op-' + id,
            },
            async () => {
              await f.connection.query
                .insertInto('orders')
                .values({ id, value: id })
                .execute();
              const time = new Date().toISOString();
              const event = normalizeEvent(
                { action: 'synthetic.request', outcome: 'success' },
                {
                  scope: a.scope.current()!,
                  kind: 'request',
                  producer: 'audit.http',
                  id: 'synthetic-request-' + id,
                  occurredAt: time,
                  recordedAt: time,
                  store: f.connection.name,
                  policyVersion: 1,
                },
              ).event;
              await f.store.append({
                ...event,
                http: {
                  method: 'POST',
                  routePattern: '/synthetic',
                  httpStatus: 200,
                  durationMs: 1,
                },
              });
            },
          ),
        ),
      );
      const all = (await f.store.query(f.scope, { store: f.connection.name }))
        .items;
      expect(all).toHaveLength(4);
      for (const id of [1, 2]) {
        const linked = all.filter(
          (event) => event.operationId === 'synthetic-op-' + id,
        );
        expect(linked.map((event) => event.kind).sort()).toEqual([
          'database',
          'request',
        ]);
        expect(
          linked.every((event) => event.actor.id === 'synthetic-' + id),
        ).toBe(true);
      }
    });

    it('A03 dispose drains a suspended managed write and rejects newly entering writes', async () => {
      const f = await fixture();
      const a = await assembly(f);
      let release!: () => void;
      let entered!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const active = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const remove = getManagedWriteRegistry(f.connection).register(
        async (descriptor, execute) => {
          entered();
          await gate;
          return execute(descriptor.connection);
        },
      );
      const write = f.connection.query
        .insertInto('orders')
        .values({ id: 1, value: 1 })
        .execute();
      await active;
      let disposed = false;
      const disposal = a.collector.dispose().then(() => {
        disposed = true;
      });
      try {
        await expect(
          f.connection.query
            .insertInto('orders')
            .values({ id: 2, value: 2 })
            .execute(),
        ).rejects.toMatchObject({ code: 'AUDIT_NOT_READY' });
        expect(disposed).toBe(false);
      } finally {
        release();
        remove();
        await write;
        await disposal;
      }
      expect(await events(f)).toHaveLength(1);
      expect(
        await auditRows(f.connection, 'SELECT * FROM "orders"'),
      ).toHaveLength(1);
    });
  });
