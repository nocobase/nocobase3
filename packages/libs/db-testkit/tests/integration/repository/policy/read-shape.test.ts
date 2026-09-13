import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createTenantFixture, selection } from '../fixtures/tenants.js';

/**
 * Phase 2 acceptance, against a real database.
 *
 * `read.fields` limits what a query returns, but every surface that merely
 * names a field leaks the same values: sorting by `budget` orders the rows by
 * it, an aggregate reports it outright, and a returning `select` on a write
 * hands it back. Each of these has to be refused rather than quietly trimmed,
 * so that a caller learns their request was denied instead of receiving a
 * plausible but incomplete answer.
 */
describeIntegrationDatabases('Repository policy read shape', (context) => {
  const scoped = () =>
    context.database.repository('policyProjects').withPolicy({
      read: { scope: true, fields: ['id', 'name'] },
      create: { scope: true, fields: ['id', 'tenantId', 'name'] },
      update: { scope: true, fields: ['name', 'budget'] },
      delete: { scope: true },
    });

  it('PR-01 trims an omitted select to the allowlist without expanding relations', async () => {
    await createTenantFixture(context);
    const records = await scoped().findMany({ filter: { id: 'p1' } });

    expect(records).toEqual([{ id: 'p1', name: 'Mine one' }]);
  });

  it('PR-02 refuses an explicitly requested field rather than trimming it', async () => {
    await createTenantFixture(context);
    await expect(
      scoped().findMany({ select: selection(['id', 'budget']) }),
    ).rejects.toMatchObject({
      code: 'FIELD_READ_FORBIDDEN',
      field: 'budget',
    });
  });

  it('PR-03 refuses a forbidden field in filter, sort, distinct and aggregate', async () => {
    await createTenantFixture(context);
    const repository = scoped();
    const forbidden = { code: 'FIELD_READ_FORBIDDEN', field: 'budget' };

    await expect(
      repository.exists({
        filter: {
          kind: 'filter',
          version: 1,
          root: {
            kind: 'group',
            logic: 'and',
            items: [
              {
                kind: 'condition',
                path: ['budget'],
                operator: '$gt',
                value: 150,
              },
            ],
          },
        },
      }),
    ).rejects.toMatchObject(forbidden);

    await expect(
      repository.findMany({
        select: selection(['id']),
        sort: {
          kind: 'sort',
          version: 1,
          items: [{ kind: 'field', path: ['budget'], direction: 'desc' }],
        },
      }),
    ).rejects.toMatchObject(forbidden);

    await expect(
      repository.findMany({
        select: selection(['id']),
        distinct: ['budget'],
      }),
    ).rejects.toMatchObject(forbidden);

    await expect(
      repository.aggregate({
        aggregate: {
          kind: 'aggregate',
          version: 1,
          items: [{ kind: 'max', field: 'budget', alias: 'peak' }],
        },
      }),
    ).rejects.toMatchObject(forbidden);

    await expect(
      repository.groupBy({
        by: ['budget'],
        aggregate: {
          kind: 'aggregate',
          version: 1,
          items: [{ kind: 'count', alias: 'total' }],
        },
      }),
    ).rejects.toMatchObject(forbidden);
  });

  it('PR-04 applies the allowlist to a mutation returning select', async () => {
    await createTenantFixture(context);
    const repository = scoped();
    const forbidden = { code: 'FIELD_READ_FORBIDDEN', field: 'budget' };

    await expect(
      repository.createOne({
        values: { id: 'p9', tenantId: 'T1', name: 'New' },
        select: selection(['id', 'budget']),
      }),
    ).rejects.toMatchObject(forbidden);

    await expect(
      repository.updateOne({
        filter: { id: 'p1' },
        values: { name: 'Renamed' },
        select: selection(['id', 'budget']),
      }),
    ).rejects.toMatchObject(forbidden);

    await expect(
      repository.deleteOne({
        filter: { id: 'p1' },
        select: selection(['id', 'budget']),
      }),
    ).rejects.toMatchObject(forbidden);

    // A refused returning select must not have written anything.
    expect(await context.database.repository('policyProjects').count()).toBe(3);
  });

  it('PR-05 refuses a relation the read policy does not list', async () => {
    await createTenantFixture(context);
    await expect(
      scoped().findMany({
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
      }),
    ).rejects.toMatchObject({
      code: 'RELATION_READ_FORBIDDEN',
      relation: 'tasks',
    });
  });

  it('PR-06 scopes an expanded relation without dropping root records', async () => {
    await createTenantFixture(context);
    const records = await context.database
      .repository('policyProjects')
      .withPolicy({
        read: {
          scope: true,
          fields: ['id'],
          relations: {
            tasks: { scope: { tenantId: 'T1' }, fields: ['id'] },
          },
        },
        create: { scope: true },
        update: { scope: true },
        delete: { scope: true },
      })
      .findMany({
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

    // p1 owns t1 (T1) and t2 (T2); only t1 is visible, and p2 and p3 stay in
    // the result with no tasks rather than disappearing.
    expect(
      [...records].sort((a, b) => String(a.id).localeCompare(String(b.id))),
    ).toEqual([
      { id: 'p1', tasks: [{ id: 't1' }] },
      { id: 'p2', tasks: [] },
      { id: 'p3', tasks: [{ id: 't3' }] },
    ]);
  });
});
