import { beforeEach, expect, it } from 'vitest';
import { decimalResult } from '../decimal/assertions.js';
import { describeIntegrationDatabases } from '../helpers.js';

const fields = [
  'integerValue',
  'bigintValue',
  'decimalValue',
  'floatValue',
  'doubleValue',
] as const;

describeIntegrationDatabases(
  'integer / bigint / decimal / float / double comparison',
  (context) => {
    beforeEach(async () => {
      await context.builder.createCollection('numericComparison', (c) => {
        c.integer('integerValue').nullable();
        c.bigInt('bigintValue').nullable();
        c.decimal('decimalValue', { precision: 20, scale: 2 }).nullable();
        c.float('floatValue').nullable();
        c.double('doubleValue').nullable();
      });
    });

    it('unifies ordinary reads and aliases', async () => {
      const db = context.database;
      await db
        .query()
        .insertInto('numericComparison')
        .values({
          integerValue: 42,
          bigintValue: '42',
          decimalValue: '42.00',
          floatValue: 42,
          doubleValue: 42,
        })
        .execute();
      const decimalValue = decimalResult('42');
      expect(
        await db
          .query()
          .selectFrom('numericComparison as n')
          .select([
            'n.integerValue as integerAlias',
            'n.bigintValue as bigintAlias',
            'n.decimalValue as decimalAlias',
            'n.floatValue as floatAlias',
            'n.doubleValue as doubleAlias',
          ])
          .executeTakeFirstOrThrow(),
      ).toEqual({
        integerAlias: 42,
        bigintAlias: '42',
        decimalAlias: decimalValue,
        floatAlias: 42,
        doubleAlias: 42,
      });
      expect(
        await db
          .repository('numericComparison')
          .findOne({ filter: { integerValue: 42 } }),
      ).toEqual({
        integerValue: 42,
        bigintValue: '42',
        decimalValue,
        floatValue: 42,
        doubleValue: 42,
      });
    });

    it.each([
      {
        label: 'positive values and null',
        values: [42, 43, null],
        total: '85',
        average: '42.5',
        minimum: 42,
        maximum: 43,
      },
      {
        label: 'negative values and zero',
        values: [-2, 0, 2],
        total: '0',
        average: '0',
        minimum: -2,
        maximum: 2,
      },
      {
        label: 'only nulls',
        values: [null, null],
        total: null,
        average: null,
        minimum: null,
        maximum: null,
      },
      {
        label: 'empty input',
        values: [],
        total: null,
        average: null,
        minimum: null,
        maximum: null,
      },
    ])(
      'compares all aggregate values and types for $label',
      async ({ values, total, average, minimum, maximum }) => {
        const db = context.database;
        if (values.length)
          await db
            .query()
            .insertInto('numericComparison')
            .values(
              values.map((value) => ({
                integerValue: value,
                bigintValue: value === null ? null : String(value),
                decimalValue: value === null ? null : `${value}.00`,
                floatValue: value,
                doubleValue: value,
              })),
            )
            .execute();
        for (const field of fields) {
          const expected = {
            count: values.filter((value) => value !== null).length,
            total:
              total === null
                ? null
                : ['floatValue', 'doubleValue'].includes(field)
                  ? Number(total)
                  : decimalResult(total),
            average:
              average === null
                ? null
                : ['floatValue', 'doubleValue'].includes(field)
                  ? Number(average)
                  : decimalResult(average),
            minimum:
              minimum === null ||
              !['bigintValue', 'decimalValue'].includes(field)
                ? minimum
                : field === 'decimalValue'
                  ? decimalResult(minimum)
                  : String(minimum),
            maximum:
              maximum === null ||
              !['bigintValue', 'decimalValue'].includes(field)
                ? maximum
                : field === 'decimalValue'
                  ? decimalResult(maximum)
                  : String(maximum),
          };
          expect(
            await db
              .query()
              .selectFrom('numericComparison as n')
              .select((eb) => [
                eb.fn.count(`n.${field}`).as('count'),
                eb.fn.sum(`n.${field}`).as('total'),
                eb.fn.avg(`n.${field}`).as('average'),
                eb.fn.min(`n.${field}`).as('minimum'),
                eb.fn.max(`n.${field}`).as('maximum'),
              ])
              .executeTakeFirstOrThrow(),
            `Query ${field}`,
          ).toEqual(expected);
          expect(
            await db.repository('numericComparison').aggregate({
              aggregate: (a) => ({
                count: a.count(field),
                total: a.sum(field),
                average: a.avg(field),
                minimum: a.min(field),
                maximum: a.max(field),
              }),
            }),
            `Repository ${field}`,
          ).toEqual(expected);
        }
      },
    );

    it.each(['floatValue', 'doubleValue'] as const)(
      'returns numeric fractional MIN/MAX for %s',
      async (field) => {
        const db = context.database;
        // Binary-exact fractions isolate the result-type contract from rounding.
        const values = [-1.5, 0, 2.25, null];
        await db
          .query()
          .insertInto('numericComparison')
          .values(values.map((value) => ({ [field]: value })))
          .execute();
        expect(
          await db
            .query()
            .selectFrom('numericComparison as n')
            .select(`n.${field} as value`)
            .where(`n.${field}`, 'is not', null)
            .orderBy(`n.${field}`)
            .execute(),
        ).toEqual([{ value: -1.5 }, { value: 0 }, { value: 2.25 }]);
        expect(
          await db.repository('numericComparison').findMany({
            select: (s) => s.fields(field),
            filter: (f) => f.number(field).notEmpty(),
            sort: (s) => s.field(field).asc(),
          }),
        ).toEqual([-1.5, 0, 2.25].map((value) => ({ [field]: value })));
        const expected = {
          count: 3,
          total: 0.75,
          average: 0.25,
          minimum: -1.5,
          maximum: 2.25,
        };
        expect(
          await db
            .query()
            .selectFrom('numericComparison as n')
            .select((eb) => [
              eb.fn.count(`n.${field}`).as('count'),
              eb.fn.sum(`n.${field}`).as('total'),
              eb.fn.avg(`n.${field}`).as('average'),
              eb.fn.min(`n.${field}`).as('minimum'),
              eb.fn.max(`n.${field}`).as('maximum'),
            ])
            .executeTakeFirstOrThrow(),
        ).toEqual(expected);
        expect(
          await db.repository('numericComparison').aggregate({
            aggregate: (a) => ({
              count: a.count(field),
              total: a.sum(field),
              average: a.avg(field),
              minimum: a.min(field),
              maximum: a.max(field),
            }),
          }),
        ).toEqual(expected);
      },
    );

    it.each(['float', 'double'] as const)(
      'preserves numeric %s extrema in groups, subqueries and relations',
      async (type) => {
        const db = context.database;
        await context.builder.createCollection('floatingChildren', (c) => {
          c.string('parentId');
          c[type]('value').nullable();
        });
        await context.builder.createCollection('floatingParents', (c) => {
          c.string('id').primary();
          c.hasMany('children', 'floatingChildren')
            .sourceKey('id')
            .foreignKey('parentId');
        });
        await db
          .query()
          .insertInto('floatingParents')
          .values([{ id: 'A' }, { id: 'B' }])
          .execute();
        await db
          .query()
          .insertInto('floatingChildren')
          .values([
            { parentId: 'A', value: -1.5 },
            { parentId: 'A', value: 2.25 },
            { parentId: 'A', value: null },
          ])
          .execute();
        const expected = [{ parentId: 'A', minimum: -1.5, maximum: 2.25 }];
        expect(
          await db
            .query()
            .selectFrom('floatingChildren as c')
            .select('c.parentId')
            .select((eb) => [
              eb.fn.min('c.value').as('minimum'),
              eb.fn.max('c.value').as('maximum'),
            ])
            .groupBy('c.parentId')
            .execute(),
        ).toEqual(expected);
        expect(
          await db.repository('floatingChildren').groupBy({
            by: ['parentId'],
            aggregate: (a) => ({
              minimum: a.min('value'),
              maximum: a.max('value'),
            }),
          }),
        ).toEqual(expected);
        expect(
          await db
            .query()
            .selectFrom('floatingParents')
            .select((eb) => [
              eb
                .selectFrom('floatingChildren')
                .select((inner) => [inner.fn.min('value').as('value')])
                .as('minimum'),
              eb
                .selectFrom('floatingChildren')
                .select((inner) => [inner.fn.max('value').as('value')])
                .as('maximum'),
            ])
            .where('id', '=', 'A')
            .execute(),
        ).toEqual([{ minimum: -1.5, maximum: 2.25 }]);
        expect(
          await db.repository('floatingParents').findMany({
            select: (s) =>
              s.fields('id').include('children', (c) =>
                c.combine({
                  minimum: c.min('value'),
                  maximum: c.max('value'),
                }),
              ),
            sort: (s) => s.field('id').asc(),
          }),
        ).toEqual([
          { id: 'A', children: { minimum: -1.5, maximum: 2.25 } },
          { id: 'B', children: { minimum: null, maximum: null } },
        ]);
      },
    );

    it('preserves decimal aggregate values with database formatting', async () => {
      const db = context.database;
      await db
        .query()
        .insertInto('numericComparison')
        .values([
          { decimalValue: '0.10' },
          { decimalValue: '0.20' },
          { decimalValue: null },
        ])
        .execute();
      const expected = {
        count: 2,
        total: decimalResult('0.3'),
        average: decimalResult('0.15'),
        minimum: decimalResult('0.1'),
        maximum: decimalResult('0.2'),
      };
      expect(
        await db
          .query()
          .selectFrom('numericComparison as n')
          .select((eb) => [
            eb.fn.count('n.decimalValue').as('count'),
            eb.fn.sum('n.decimalValue').as('total'),
            eb.fn.avg('n.decimalValue').as('average'),
            eb.fn.min('n.decimalValue').as('minimum'),
            eb.fn.max('n.decimalValue').as('maximum'),
          ])
          .executeTakeFirstOrThrow(),
      ).toEqual(expected);
      expect(
        await db.repository('numericComparison').aggregate({
          aggregate: (a) => ({
            count: a.count('decimalValue'),
            total: a.sum('decimalValue'),
            average: a.avg('decimalValue'),
            minimum: a.min('decimalValue'),
            maximum: a.max('decimalValue'),
          }),
        }),
      ).toEqual(expected);
    });
  },
);
