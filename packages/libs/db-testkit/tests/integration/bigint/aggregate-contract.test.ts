import { decimalResult } from '../decimal/assertions.js';
import { beforeEach, expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('precise aggregate contract', (context) => {
  beforeEach(async () => {
    await context.builder.createCollection('aggregateValues', (c) => {
      c.increments('id');
      c.string('category');
      c.bigInt('amount').nullable();
      c.integer('quantity');
    });
  });

  it('shares exact values and types between Query and Repository', async () => {
    const db = context.database;
    await db
      .query()
      .insertInto('aggregateValues')
      .values([
        { category: 'A', amount: '9007199254740993', quantity: 42 },
        { category: 'A', amount: '9007199254740994', quantity: 43 },
        { category: 'A', amount: null, quantity: 0 },
      ])
      .execute();
    const query = db
      .query()
      .selectFrom('aggregateValues as v')
      .select((eb) => [
        eb.fn.countAll().as('count'),
        eb.fn.count('v.amount').as('present'),
        eb.fn.sum('v.amount').as('total'),
        eb.fn.avg('v.amount').as('average'),
        eb.fn.min('v.amount').as('minimum'),
        eb.fn.max('v.amount').as('maximum'),
        eb.fn.min('v.quantity').as('smallest'),
        eb.fn.max('v.quantity').as('largest'),
        eb.fn.sum('v.quantity').as('quantityTotal'),
      ]);
    const expected = {
      count: 3,
      present: 2,
      total: decimalResult('18014398509481987'),
      average: decimalResult('9007199254740993.5'),
      minimum: '9007199254740993',
      maximum: '9007199254740994',
      smallest: 0,
      largest: 43,
      quantityTotal: decimalResult('85'),
    };
    expect(await query.executeTakeFirstOrThrow()).toEqual(expected);
    expect(await query.execute()).toEqual([expected]);
    expect(
      await db.repository('aggregateValues').aggregate({
        aggregate: (a) => ({
          count: a.count(),
          present: a.count('amount'),
          total: a.sum('amount'),
          average: a.avg('amount'),
          minimum: a.min('amount'),
          maximum: a.max('amount'),
          smallest: a.min('quantity'),
          largest: a.max('quantity'),
          quantityTotal: a.sum('quantity'),
        }),
      }),
    ).toEqual(expected);
    expect(await db.repository('aggregateValues').count()).toBe(3);
  });

  it('sorts and filters aggregate values numerically through aliases', async () => {
    const db = context.database;
    await db
      .query()
      .insertInto('aggregateValues')
      .values([
        { category: 'negative', amount: '-11', quantity: 1 },
        { category: 'small', amount: '2', quantity: 1 },
        { category: 'large', amount: '10', quantity: 1 },
        { category: 'adjacentA', amount: '9007199254740993', quantity: 1 },
        { category: 'adjacentB', amount: '9007199254740994', quantity: 1 },
      ])
      .execute();
    const query = db
      .query()
      .selectFrom('aggregateValues')
      .select((eb) => [
        'category',
        eb.fn.sum('amount').as('total'),
        eb.fn.avg('amount').as('average'),
      ])
      .groupBy('category')
      .orderBy('total');
    const expected = [
      {
        category: 'negative',
        total: decimalResult('-11'),
        average: decimalResult('-11'),
      },
      {
        category: 'small',
        total: decimalResult('2'),
        average: decimalResult('2'),
      },
      {
        category: 'large',
        total: decimalResult('10'),
        average: decimalResult('10'),
      },
      {
        category: 'adjacentA',
        total: decimalResult('9007199254740993'),
        average: decimalResult('9007199254740993'),
      },
      {
        category: 'adjacentB',
        total: decimalResult('9007199254740994'),
        average: decimalResult('9007199254740994'),
      },
    ];
    expect(await query.execute()).toEqual(expected);
    expect(
      await query
        .having((eb) => eb(eb.fn.sum('amount'), '>', '9007199254740993'))
        .execute(),
    ).toEqual(expected.slice(-1));
    expect(
      await db.repository('aggregateValues').groupBy({
        by: ['category'],
        aggregate: (a) => ({
          total: a.sum('amount'),
          average: a.avg('amount'),
        }),
        sort: (s) => s.field('total').asc(),
      }),
    ).toEqual(expected);
    expect(
      await db.repository('aggregateValues').groupBy({
        by: ['category'],
        aggregate: (a) => ({
          total: a.sum('amount'),
          average: a.avg('amount'),
        }),
        having: (f) => f.number('total').gt(2),
        sort: (s) => s.field('total').asc(),
      }),
    ).toEqual(expected.slice(2));
  });

  it('preserves exact relation aggregates and empty relations', async () => {
    await context.builder.createCollection('aggregateParents', (c) => {
      c.string('key').primary();
      c.hasMany('values', 'aggregateValues')
        .sourceKey('key')
        .foreignKey('category');
    });
    const db = context.database;
    await db
      .query()
      .insertInto('aggregateParents')
      .values([{ key: 'A' }, { key: 'B' }])
      .execute();
    await db
      .query()
      .insertInto('aggregateValues')
      .values([
        { category: 'A', amount: '9007199254740993', quantity: 2 },
        { category: 'A', amount: '9007199254740994', quantity: 10 },
      ])
      .execute();
    expect(
      await db.repository('aggregateParents').findMany({
        select: (s) =>
          s.fields('key').include('values', (v) =>
            v.combine({
              count: v.count(),
              total: v.sum('amount'),
              average: v.avg('amount'),
              minimum: v.min('amount'),
              maximum: v.max('amount'),
              smallest: v.min('quantity'),
              largest: v.max('quantity'),
            }),
          ),
        sort: (s) => s.field('key').asc(),
      }),
    ).toEqual([
      {
        key: 'A',
        values: {
          count: 2,
          total: decimalResult('18014398509481987'),
          average: decimalResult('9007199254740993.5'),
          minimum: '9007199254740993',
          maximum: '9007199254740994',
          smallest: 2,
          largest: 10,
        },
      },
      {
        key: 'B',
        values: {
          count: 0,
          total: null,
          average: null,
          minimum: null,
          maximum: null,
          smallest: null,
          largest: null,
        },
      },
    ]);
  });

  it('keeps DISTINCT and transactions precise', async () => {
    await context.database.transaction(async (connection) => {
      await connection.query
        .insertInto('aggregateValues')
        .values([
          { category: 'A', amount: '9007199254740993', quantity: 1 },
          { category: 'A', amount: '9007199254740993', quantity: 1 },
        ])
        .execute();
      expect(
        await connection.query
          .selectFrom('aggregateValues')
          .select((eb) => [
            eb.fn.sum('amount').distinct().as('total'),
            eb.fn.avg('amount').distinct().as('average'),
            eb.fn.count('amount').distinct().as('count'),
          ])
          .executeTakeFirstOrThrow(),
      ).toEqual({
        total: decimalResult('9007199254740993'),
        average: decimalResult('9007199254740993'),
        count: 1,
      });
    });
  });

  it('preserves scalar aggregate subqueries and exact HAVING aliases', async () => {
    const db = context.database;
    await db
      .query()
      .insertInto('aggregateValues')
      .values([{ category: 'A', amount: '9007199254740993', quantity: 7 }])
      .execute();
    expect(
      await db
        .query()
        .selectFrom('aggregateValues as outerRow')
        .select((eb) => [
          eb
            .selectFrom('aggregateValues as innerRow')
            .select((inner) => [inner.fn.avg('innerRow.amount').as('value')])
            .as('average'),
          eb
            .selectFrom('aggregateValues as innerRow')
            .select('innerRow.quantity')
            .as('quantity'),
        ])
        .execute(),
    ).toEqual([{ average: decimalResult('9007199254740993'), quantity: 7 }]);
    const grouped = db
      .query()
      .selectFrom('aggregateValues')
      .select((eb) => [eb.fn.sum('amount').as('total')])
      .groupBy('category');
    expect(
      await grouped.having('total', '=', '9007199254740993').execute(),
    ).toEqual([{ total: decimalResult('9007199254740993') }]);
    expect(
      await grouped
        .having((eb) =>
          eb.between(
            eb.fn.sum('amount'),
            '9007199254740992',
            '9007199254740994',
          ),
        )
        .execute(),
    ).toHaveLength(1);
    expect(
      await grouped
        .having((eb) => eb(eb.fn.sum('amount'), 'in', ['9007199254740993']))
        .execute(),
    ).toHaveLength(1);
  });

  it('keeps a sum beyond int64 exact without changing the input storage range', async () => {
    const amount = '999999999999999999';
    await context.database
      .query()
      .insertInto('aggregateValues')
      .values(Array.from({ length: 10 }, () => ({ amount })))
      .execute();
    expect(
      await context.database
        .query()
        .selectFrom('aggregateValues')
        .select((eb) => [
          eb.fn.sum('amount').as('total'),
          eb.fn.avg('amount').as('average'),
        ])
        .executeTakeFirstOrThrow(),
    ).toEqual({
      total: decimalResult('9999999999999999990'),
      average: decimalResult(amount),
    });
    expect(
      await context.database.repository('aggregateValues').aggregate({
        aggregate: (a) => ({
          total: a.sum('amount'),
          average: a.avg('amount'),
        }),
      }),
    ).toEqual({
      total: decimalResult('9999999999999999990'),
      average: decimalResult(amount),
    });
  });

  it('preserves fractional averages while allowing trailing precision differences', async () => {
    await context.database
      .query()
      .insertInto('aggregateValues')
      .values([{ amount: '0' }, { amount: '0' }, { amount: '1' }])
      .execute();
    const result = await context.database
      .query()
      .selectFrom('aggregateValues')
      .select((eb) => [eb.fn.avg('amount').as('average')])
      .executeTakeFirstOrThrow();
    expect(result.average).toMatch(/^0?\.3{4,}$/);
  });
});
