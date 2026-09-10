import { beforeEach, expect, it } from 'vitest';
import { decimalResult } from './assertions.js';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('decimal string results', (context) => {
  beforeEach(async () => {
    await context.builder.createCollection('decimalValues', (c) => {
      c.string('id').primary();
      c.string('parentId');
      c.decimal('amount', { precision: 30, scale: 6 }).nullable();
      c.integer('quantity');
    });
    await context.builder.createCollection('decimalParents', (c) => {
      c.string('id').primary();
      c.hasMany('values', 'decimalValues')
        .sourceKey('id')
        .foreignKey('parentId');
    });
  });

  it.each([
    { input: '42.000000', expected: '42' },
    { input: '-42.500000', expected: '-42.5' },
    { input: '0.100000', expected: '0.1' },
    // Exactly representable even in SQLite REAL, with more than 15 significant digits.
    { input: '100000000000000.25', expected: '100000000000000.25' },
    { input: null, expected: null },
  ])(
    'preserves $input through aliases, stars, subqueries, mutations and streams',
    async ({ input, expected: exact }) => {
      const expected = decimalResult(exact);
      const db = context.database;
      const repository = db.repository('decimalValues');
      const record = { id: 'A', parentId: null, amount: expected, quantity: 7 };
      await db.transaction(async (connection) => {
        expect(
          (
            await connection
              .repository('decimalValues')
              .createOne({ values: { id: 'A', amount: input, quantity: 7 } })
          ).record,
        ).toEqual(record);
        expect(
          await connection.query
            .selectFrom('decimalValues as d')
            .selectAll('d')
            .execute(),
        ).toEqual([record]);
      });
      expect(
        await db.query().selectFrom('decimalValues').executeTakeFirstOrThrow(),
      ).toEqual(record);
      expect(
        await db
          .query()
          .selectFrom('decimalValues as d')
          .select(['d.amount as value', 'd.quantity'])
          .execute(),
      ).toEqual([{ value: expected, quantity: 7 }]);
      expect(
        await db
          .query()
          .selectFrom('decimalValues')
          .select((eb) => [
            eb
              .selectFrom('decimalValues as innerRow')
              .select('innerRow.amount')
              .as('value'),
          ])
          .execute(),
      ).toEqual([{ value: expected }]);
      expect(
        await db
          .query()
          .selectFrom('decimalValues')
          .select((eb) => [
            eb.fn.min('amount').as('minimum'),
            eb.fn.max('amount').as('maximum'),
          ])
          .execute(),
      ).toEqual([{ minimum: expected, maximum: expected }]);
      const streamed = [];
      for await (const row of repository.findMany({
        sort: (s) => s.field('id').asc(),
      }))
        streamed.push(row);
      expect(streamed).toEqual([record]);
      expect(
        (
          await repository.updateOne({
            filter: { id: 'A' },
            values: { amount: '2.500000' },
          })
        ).record.amount,
      ).toEqual(decimalResult('2.5'));
    },
  );

  it('retains numeric ordering, joins, grouped decimals and relation aggregates', async () => {
    const db = context.database;
    await db.query().insertInto('decimalParents').values({ id: 'P' }).execute();
    await db
      .query()
      .insertInto('decimalValues')
      .values([
        { id: 'B', parentId: 'P', amount: '10.50', quantity: 1 },
        { id: 'A', parentId: 'P', amount: '2.50', quantity: 1 },
        { id: 'C', parentId: 'P', amount: '-1.50', quantity: 1 },
      ])
      .execute();
    expect(
      await db
        .query()
        .selectFrom('decimalValues as v')
        .innerJoin('decimalParents as p', 'p.id', 'v.parentId')
        .select(['v.amount as value', 'p.id as parent'])
        .where('v.amount', '>', 0)
        .orderBy('value')
        .execute(),
    ).toEqual([
      { value: decimalResult('2.5'), parent: 'P' },
      { value: decimalResult('10.5'), parent: 'P' },
    ]);
    expect(
      await db.repository('decimalValues').groupBy({
        by: ['amount'],
        aggregate: (a) => ({ count: a.count() }),
        sort: (s) => s.field('amount').asc(),
      }),
    ).toEqual([
      { amount: decimalResult('-1.5'), count: 1 },
      { amount: decimalResult('2.5'), count: 1 },
      { amount: decimalResult('10.5'), count: 1 },
    ]);
    const selection = () =>
      db.repository('decimalParents').findMany({
        select: (s) =>
          s.fields('id').include('values', (v) =>
            v.combine({
              records: v.fields('amount').sort((s) => s.field('amount').asc()),
              total: v.sum('amount'),
              minimum: v.min('amount'),
              maximum: v.max('amount'),
            }),
          ),
      });
    const expected = [
      {
        id: 'P',
        values: {
          records: [
            { amount: decimalResult('-1.5') },
            { amount: decimalResult('2.5') },
            { amount: decimalResult('10.5') },
          ],
          total: decimalResult('11.5'),
          minimum: decimalResult('-1.5'),
          maximum: decimalResult('10.5'),
        },
      },
    ];
    expect(await selection()).toEqual(expected);
    const streamed = [];
    for await (const row of selection()) streamed.push(row);
    expect(streamed).toEqual(expected);
  });
  it('preserves decimal ordering through distinct reads and relation pagination', async () => {
    const db = context.database;
    await db.query().insertInto('decimalParents').values({ id: 'P' }).execute();
    await db
      .query()
      .insertInto('decimalValues')
      .values([
        { id: 'A', parentId: 'P', amount: '10.5' },
        { id: 'B', parentId: 'P', amount: '2.5' },
        { id: 'C', parentId: 'P', amount: '2.5' },
      ])
      .execute();
    expect(
      await db
        .query()
        .selectFrom('decimalValues')
        .select('amount as value')
        .distinct()
        .orderBy('value')
        .execute(),
    ).toEqual([
      { value: decimalResult('2.5') },
      { value: decimalResult('10.5') },
    ]);
    expect(
      await db.repository('decimalValues').findMany({
        select: (s) => s.fields('amount'),
        distinct: ['amount'],
        sort: (s) => [s.field('amount').asc(), s.field('id').asc()],
      }),
    ).toEqual([
      { amount: decimalResult('2.5') },
      { amount: decimalResult('10.5') },
    ]);
    expect(
      await db.repository('decimalParents').findMany({
        select: (s) =>
          s.fields('id').include('values', (v) =>
            v
              .fields('amount')
              .distinct(['amount'])
              .sort((s) => [s.field('amount').asc(), s.field('id').asc()])
              .limit(1),
          ),
      }),
    ).toEqual([{ id: 'P', values: [{ amount: decimalResult('2.5') }] }]);
  });

  it('returns generated identities and decimal defaults after creation', async () => {
    await context.builder.createCollection('decimalDefaults', (c) => {
      c.increments('id');
      c.decimal('amount', { precision: 20, scale: 6 }).defaultTo('42.500000');
    });
    const result = await context.database
      .repository('decimalDefaults')
      .createOne({ values: {} });
    expect(result.record).toMatchObject({ amount: decimalResult('42.5') });
    expect(result.record.id).toBeDefined();
  });
});
