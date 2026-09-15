import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { ref } from '../../../../../db/src/index.js';
import { createTenantFixture, selection } from '../fixtures/tenants.js';

const T1 = {
  policyProjects: {
    read: { scope: { tenantId: 'T1' }, fields: ['id', 'name'] },
    create: { scope: true, fields: ['id', 'tenantId', 'name'] },
    update: { scope: { tenantId: 'T1' }, fields: ['name'] },
    delete: { scope: { tenantId: 'T1' } },
  },
} as const;

/**
 * Binding lives on the Connection because a request touches several
 * Collections and takes fresh Repositories inside a transaction. These check
 * the two things that makes load-bearing: the binding survives into a
 * transaction, and deriving a bound Connection does not quietly build a
 * second one underneath.
 */
describeIntegrationDatabases(
  'Repository policy connection binding',
  (context) => {
    it('PB-01 binds the policy to repositories taken from the connection', async () => {
      await createTenantFixture(context);
      const scoped = context.connection.withPolicies(T1, undefined);

      expect(await scoped.repository('policyProjects').count()).toBe(2);
      // A collection the map does not cover stays unbound.
      expect(await scoped.repository('policyTasks').count()).toBe(5);
      // And the connection it was derived from is untouched.
      expect(await context.database.repository('policyProjects').count()).toBe(
        3,
      );
    });

    it('PB-02 carries the binding into a transaction', async () => {
      await createTenantFixture(context);
      const scoped = context.connection.withPolicies(T1, undefined);

      await scoped.transaction(async (transaction) => {
        const projects = transaction.repository('policyProjects');
        expect(await projects.count()).toBe(2);
        await expect(
          projects.updateOne({ filter: { id: 'p3' }, values: { name: 'x' } }),
        ).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
        await projects.updateOne({
          filter: { id: 'p1' },
          values: { name: 'Renamed' },
        });
      });

      expect(
        await context.database.repository('policyProjects').findMany({
          filter: { id: 'p1' },
          select: selection(['id', 'name']),
        }),
      ).toEqual([{ id: 'p1', name: 'Renamed' }]);
    });

    it('PB-03 rolls a transaction back through the bound connection', async () => {
      await createTenantFixture(context);
      const scoped = context.connection.withPolicies(T1, undefined);

      await expect(
        scoped.transaction(async (transaction) => {
          await transaction
            .repository('policyProjects')
            .updateOne({ filter: { id: 'p1' }, values: { name: 'Renamed' } });
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');

      expect(
        await context.database.repository('policyProjects').findMany({
          filter: { id: 'p1' },
          select: selection(['id', 'name']),
        }),
      ).toEqual([{ id: 'p1', name: 'Mine one' }]);
    });

    it('PB-04 shares the collection registry instead of re-resolving it', async () => {
      await createTenantFixture(context);
      // Warm the registry on the original connection, then bind. A second
      // connection underneath would start with an empty cache and re-introspect
      // the schema on the first read — the cost every request would pay.
      await context.database.repository('policyProjects').count();

      const scoped = context.connection.withPolicies(T1, undefined);
      expect(scoped.collections).toBe(context.connection.collections);
      expect(scoped.schemaInspector).toBe(context.connection.schemaInspector);
      expect(await scoped.client()).toBe(await context.connection.client());
    });

    it('PB-05 reports what it bound', async () => {
      await createTenantFixture(context);
      const scoped = context.connection.withPolicies(T1, undefined);

      expect(Object.keys(scoped.explainPolicies())).toEqual(['policyProjects']);
      expect(scoped.explainPolicies().policyProjects).toMatchObject({
        read: { fields: ['id', 'name'] },
        delete: { scope: { root: { items: [{ path: ['tenantId'] }] } } },
      });
    });

    it('PB-07 expands a policy reference against the same binding', async () => {
      await createTenantFixture(context);
      const scoped = context.connection.withPolicies(
        {
          policyProjects: {
            read: {
              scope: true,
              fields: ['id'],
              relations: { tasks: ref('policyTasks') },
            },
            create: { scope: true },
            update: { scope: true },
            delete: { scope: true },
          },
          policyTasks: {
            read: { scope: { tenantId: 'T1' }, fields: ['id'] },
            create: { scope: true },
            update: { scope: true },
            delete: { scope: true },
          },
        },
        undefined,
      );

      const records = await scoped.repository('policyProjects').findMany({
        select: {
          kind: 'select',
          version: 1,
          root: {
            kind: 'selection',
            fields: ['id'],
            includes: [
              {
                kind: 'include',
                relation: 'tasks',
                select: { kind: 'selection', fields: ['id'], includes: [] },
              },
            ],
          },
        },
      });

      // The reference carried both the field allowlist and the scope across,
      // so p1's task from the other tenant stays hidden.
      expect(
        [...records].sort((a, b) => String(a.id).localeCompare(String(b.id))),
      ).toEqual([
        { id: 'p1', tasks: [{ id: 't1' }] },
        { id: 'p2', tasks: [] },
        { id: 'p3', tasks: [{ id: 't3' }] },
      ]);
    });

    it('PB-06 evaluates a principal function once per binding', async () => {
      await createTenantFixture(context);
      let calls = 0;
      const scoped = context.connection.withPolicies(
        {
          policyProjects: (principal: { tenantId: string }) => {
            calls += 1;
            return {
              read: { scope: { tenantId: principal.tenantId }, fields: ['id'] },
              create: { scope: true },
              update: { scope: true },
              delete: { scope: true },
            };
          },
        },
        { tenantId: 'T2' },
      );

      await scoped.repository('policyProjects').count();
      await scoped.repository('policyProjects').count();
      await scoped.transaction(async (transaction) => {
        expect(await transaction.repository('policyProjects').count()).toBe(1);
      });

      expect(calls).toBe(1);
    });
  },
);
