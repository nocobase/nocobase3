import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';

describeIntegrationDatabases('Repository enum grouping', (context) => {
  const members = ['Paid', 'paid', 'paid ', '中文', '😀', "a'b", 'a,b'];
  async function setup() {
    await context.builder.createCollection('enumGroups', (c) => {
      c.string('id').primary();
      c.enum('status', { values: members }).nullable();
      c.string('region').notNull();
      c.integer('amount').notNull();
    });
    const repo = context.database.repository('enumGroups');
    for (const [index, status] of [...members, 'paid', null, null].entries()) {
      await repo.createOne({
        values: {
          id: String(index),
          status,
          region: 'east',
          amount: index + 1,
        },
      });
    }
    return repo;
  }
  it('keeps case, trailing spaces, unicode and NULL distinct with multi-field keys', async () => {
    const repo = await setup();
    const rows = await repo.groupBy({
      by: ['status', 'region'],
      aggregate: (a) => ({ count: a.count(), total: a.sum('amount') }),
    });
    expect(rows).toHaveLength(members.length + 1);
    expect(rows).toEqual(
      expect.arrayContaining([
        { status: 'Paid', region: 'east', count: 1, total: expect.anything() },
        { status: 'paid', region: 'east', count: 2, total: expect.anything() },
        { status: 'paid ', region: 'east', count: 1, total: expect.anything() },
        { status: null, region: 'east', count: 2, total: expect.anything() },
      ]),
    );
    expect(Number(rows.find((row) => row.status === 'paid')?.total)).toBe(10);
    for (const status of members)
      expect(rows.some((row) => row.status === status)).toBe(true);
  });
  it('supports exact WHERE/HAVING, aggregate sorting and JSON ASTs', async () => {
    const repo = await setup();
    expect(
      await repo.groupBy({
        by: ['status'],
        filter: { status: 'paid' },
        aggregate: (a) => ({ count: a.count() }),
        having: { status: 'paid' },
        sort: (s) => s.field('count').desc(),
      }),
    ).toEqual([{ status: 'paid', count: 2 }]);
    expect(
      await repo.groupBy({
        by: ['status'],
        aggregate: {
          kind: 'aggregate',
          version: 1,
          items: [{ kind: 'count', alias: 'count' }],
        },
        having: (f) =>
          f.and([f.string('status').notEmpty(), f.number('count').gte(2)]),
        sort: (s) => s.field('count').desc(),
      }),
    ).toEqual([{ status: 'paid', count: 2 }]);
    expect(
      await repo.groupBy({
        by: ['status'],
        filter: { status: 'Paid' },
        having: { status: 'paid' },
        aggregate: (a) => ({ count: a.count() }),
      }),
    ).toEqual([]);
    expect(
      await repo.groupBy({
        by: ['status'],
        having: { status: null },
        aggregate: (a) => ({ count: a.count() }),
      }),
    ).toEqual([{ status: null, count: 2 }]);
    await expect(
      repo.groupBy({
        by: ['status'],
        having: { status: 'unknown' },
        aggregate: (a) => ({ count: a.count() }),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FILTER' });
    await expect(
      repo.groupBy({
        by: ['status'],
        aggregate: (a) => ({ count: a.count() }),
        sort: (s) => s.field('status').asc(),
      }),
    ).rejects.toMatchObject({ code: 'FIELD_CAPABILITY_NOT_SUPPORTED' });
  });
  it('rejects corrupt stored members in grouped results', async () => {
    const repo = await setup();
    await context
      .db(context.table('enumGroups'))
      .where({ id: '0' })
      .update({ status: 'corrupt' });
    await expect(
      repo.groupBy({
        by: ['status'],
        aggregate: (a) => ({ count: a.count() }),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STORED_VALUE' });
  });
});
