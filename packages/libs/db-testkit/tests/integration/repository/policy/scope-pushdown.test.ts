import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import {
  allProjects,
  captureSql,
  createTenantFixture,
  selection,
  TENANT_FIELDS,
} from '../fixtures/tenants.js';

const byId = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  String(a.id).localeCompare(String(b.id));

/**
 * Phase 1 acceptance: the scope has to reach the database.
 *
 * A unit test cannot make this claim. Its adapter is a stub, so it can only
 * show that a scope condition was put into the plan — not that the plan became
 * a WHERE clause rather than a full read the repository filtered afterwards.
 * These tests read the SQL that actually ran.
 */
describeIntegrationDatabases('Repository policy scope pushdown', (context) => {
  const scoped = () =>
    context.database.repository('policyProjects').withPolicy({
      read: { scope: { tenantId: 'T1' }, fields: [...TENANT_FIELDS] },
      create: { scope: true },
      update: { scope: { tenantId: 'T1' }, fields: ['name', 'budget'] },
      delete: { scope: { tenantId: 'T1' } },
    });

  it('PS-01 puts the read scope into the WHERE clause instead of filtering afterwards', async () => {
    await createTenantFixture(context);
    const { result, statements } = await captureSql(context, () =>
      scoped().findMany({ select: selection(['id']) }),
    );

    expect(result.map((record) => record.id).sort()).toEqual(['p1', 'p2']);
    const reads = statements.filter((sql) => /^\s*select\b/i.test(sql));
    expect(reads.length).toBeGreaterThan(0);
    for (const sql of reads) expect(sql).toMatch(/where/i);
  });

  it('PS-02 intersects a caller or-group with the scope rather than flattening it', async () => {
    await createTenantFixture(context);
    // Without grouping, `(name = x OR name = y) AND tenant` would flatten into
    // `name = x OR (name = y AND tenant)`, and the first branch escapes.
    const result = await scoped().findMany({
      select: selection(['id']),
      filter: {
        kind: 'filter',
        version: 1,
        root: {
          kind: 'group',
          logic: 'or',
          items: [
            {
              kind: 'condition',
              path: ['name'],
              operator: '$eq',
              value: 'Mine one',
            },
            {
              kind: 'condition',
              path: ['name'],
              operator: '$eq',
              value: 'Theirs',
            },
          ],
        },
      },
    });

    expect(result.map((record) => record.id)).toEqual(['p1']);
  });

  it('PS-03 applies the scope to count, exists, aggregate and groupBy alike', async () => {
    await createTenantFixture(context);
    const repository = scoped();

    expect(await repository.count()).toBe(2);
    expect(await repository.exists({ filter: { id: 'p3' } })).toBe(false);
    const totals = await repository.aggregate({
      aggregate: {
        kind: 'aggregate',
        version: 1,
        items: [{ kind: 'sum', field: 'budget', alias: 'total' }],
      },
    });
    // Dialects disagree on the numeric carrier for SUM; the value is what matters.
    expect(Number(totals.total)).toBe(300);
    expect(
      await repository.groupBy({
        by: ['tenantId'],
        aggregate: {
          kind: 'aggregate',
          version: 1,
          items: [{ kind: 'count', alias: 'total' }],
        },
      }),
    ).toMatchObject([{ tenantId: 'T1', total: expect.anything() }]);
  });

  it('PS-04 narrows bulk mutations by scope, including all: true', async () => {
    await createTenantFixture(context);
    const repository = scoped();

    expect(
      await repository.updateMany({ all: true, values: { budget: 1 } }),
    ).toMatchObject({ updatedCount: 2 });
    expect((await allProjects(context)).sort(byId)).toMatchObject([
      { id: 'p1', budget: 1 },
      { id: 'p2', budget: 1 },
      { id: 'p3', budget: 300 },
    ]);

    expect(await repository.deleteMany({ all: true })).toMatchObject({
      deletedCount: 2,
    });
    expect(await allProjects(context)).toMatchObject([{ id: 'p3' }]);
  });

  it('PS-05 scopes a relation branch of the caller filter to the relation policy', async () => {
    await createTenantFixture(context);
    const repository = context.database
      .repository('policyProjects')
      .withPolicy({
        read: {
          scope: true,
          fields: ['id'],
          relations: {
            tasks: { scope: { tenantId: 'T1' }, fields: ['id', 'title'] },
          },
        },
        create: { scope: true },
        update: { scope: true },
        delete: { scope: true },
      });

    // t2 belongs to p1 but to the other tenant, so matching on it must not
    // bring p1 back.
    const result = await repository.findMany({
      select: selection(['id']),
      filter: {
        kind: 'filter',
        version: 1,
        root: {
          kind: 'group',
          logic: 'and',
          items: [
            {
              kind: 'relation',
              path: ['tasks'],
              quantifier: 'some',
              filter: {
                kind: 'group',
                logic: 'and',
                items: [
                  {
                    kind: 'condition',
                    path: ['title'],
                    operator: '$eq',
                    value: 'Theirs',
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(result).toEqual([]);
  });
});
