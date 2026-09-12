import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';
import { decimalResult } from '../decimal/assertions.js';

describeIntegrationDatabases('native aggregate contract', (context) => {
  it.each(['float', 'double'] as const)(
    'uses native %s aggregates in groups, scalar subqueries, HAVING and relations',
    async (type) => {
      await context.builder.createCollection('floatChildren', (c) => {
        c.string('parentId');
        c[type]('value').nullable();
      });
      await context.builder.createCollection('floatParents', (c) => {
        c.string('id').primary();
        c.hasMany('children', 'floatChildren')
          .sourceKey('id')
          .foreignKey('parentId');
      });
      const db = context.database;
      await db
        .query()
        .insertInto('floatParents')
        .values([{ id: 'A' }, { id: 'B' }])
        .execute();
      await db
        .query()
        .insertInto('floatChildren')
        .values([
          { parentId: 'A', value: 1.5 },
          { parentId: 'A', value: 2.5 },
          { parentId: 'A', value: null },
        ])
        .execute();
      const expected = [{ parentId: 'A', total: 4, average: 2 }];
      const statements: string[] = [];
      const listener = (query: { sql: string }) => statements.push(query.sql);
      db.connection().collections.invalidate('floatChildren');
      context.db.on('query', listener);
      try {
        expect(
          await db
            .query()
            .selectFrom('floatChildren as c')
            .select((eb) => [
              'c.parentId',
              eb.fn.sum('c.value').as('total'),
              eb.fn.avg('c.value').as('average'),
            ])
            .groupBy('c.parentId')
            .having('average', '>', 1.75)
            .orderBy('total')
            .execute(),
        ).toEqual(expected);
      } finally {
        context.db.off('query', listener);
      }
      const businessSql = statements[statements.length - 1];
      expect(businessSql).not.toMatch(
        /nb_decimal_(?:sum|avg)|cast\([^)]* as (?:numeric|decimal)/i,
      );
      if (
        ['postgres', 'kingbase-postgres', 'mysql'].includes(
          context.spec.dialect,
        )
      )
        expect(statements).toHaveLength(1);
      expect(
        await db.repository('floatChildren').groupBy({
          by: ['parentId'],
          aggregate: (a) => ({
            total: a.sum('value'),
            average: a.avg('value'),
          }),
          having: (f) => f.number('average').gt(1.75),
          sort: (s) => s.field('total').asc(),
        }),
      ).toEqual(expected);
      expect(
        await db
          .query()
          .selectFrom('floatParents')
          .select((eb) => [
            eb
              .selectFrom('floatChildren')
              .select((inner) => [inner.fn.sum('value').as('value')])
              .as('total'),
            eb
              .selectFrom('floatChildren')
              .select((inner) => [inner.fn.avg('value').as('value')])
              .as('average'),
          ])
          .where('id', '=', 'A')
          .execute(),
      ).toEqual([{ total: 4, average: 2 }]);
      expect(
        await db.repository('floatParents').findMany({
          select: (s) =>
            s
              .fields('id')
              .include('children', (c) =>
                c.combine({ total: c.sum('value'), average: c.avg('value') }),
              ),
          sort: (s) => s.field('id').asc(),
        }),
      ).toEqual([
        { id: 'A', children: { total: 4, average: 2 } },
        { id: 'B', children: { total: null, average: null } },
      ]);
    },
  );

  it('keeps native exact aggregate formatting and documents large AVG rounding', async () => {
    await context.builder.createCollection('nativeExact', (c) => {
      c.bigInt('amount');
      c.decimal('price', { precision: 30, scale: 2 });
    });
    const db = context.database;
    await db
      .query()
      .insertInto('nativeExact')
      .values([
        { amount: '999999999999999998', price: '42.00' },
        { amount: '999999999999999999', price: '43.00' },
      ])
      .execute();
    const result = await db
      .query()
      .selectFrom('nativeExact')
      .select((eb) => [
        eb.fn.avg('amount').as('average'),
        eb.fn.sum('price').as('totalPrice'),
        eb.fn.avg('price').as('averagePrice'),
      ])
      .executeTakeFirstOrThrow();
    expect(result).toEqual({
      average: decimalResult(
        ['postgres', 'kingbase-postgres'].includes(context.spec.dialect)
          ? '999999999999999999'
          : '999999999999999998.5',
      ),
      totalPrice: decimalResult('85'),
      averagePrice: decimalResult('42.5'),
    });
    expect(
      await db.repository('nativeExact').aggregate({
        aggregate: (a) => ({
          average: a.avg('amount'),
          totalPrice: a.sum('price'),
          averagePrice: a.avg('price'),
        }),
      }),
    ).toEqual(result);
    if (
      ['postgres', 'kingbase-postgres', 'mysql'].includes(context.spec.dialect)
    ) {
      const native = await context
        .db(context.table('nativeExact'))
        .select(
          context.db.raw('avg(??) as ??, sum(??) as ??, avg(??) as ??', [
            'amount',
            'average',
            'price',
            'totalPrice',
            'price',
            'averagePrice',
          ]),
        )
        .first();
      expect(result).toEqual(native);
      expect(result.totalPrice).toBe('85.00');
      expect(result.averagePrice).toMatch(/^42\.50+$/);
    }
  });
  it.each([
    {
      scale: 2,
      input: '10000000000000000000000.00',
      total: '20000000000000000000000',
      average: '10000000000000000000000',
    },
    {
      scale: 20,
      input: '0.00000000000000000001',
      total: '0.00000000000000000002',
      average: '0.00000000000000000001',
    },
  ])(
    'retains DECIMAL capacity and scale $scale during aggregation',
    async ({ scale, input, total, average }) => {
      await context.builder.createCollection('decimalCapacity', (c) => {
        c.decimal('value', { precision: 30, scale });
      });
      const db = context.database;
      await db
        .query()
        .insertInto('decimalCapacity')
        .values([{ value: input }, { value: input }])
        .execute();
      const expected = {
        total: decimalResult(total),
        average: decimalResult(average),
      };
      expect(
        await db
          .query()
          .selectFrom('decimalCapacity')
          .select((eb) => [
            eb.fn.sum('value').as('total'),
            eb.fn.avg('value').as('average'),
          ])
          .executeTakeFirstOrThrow(),
      ).toEqual(expected);
      expect(
        await db.repository('decimalCapacity').aggregate({
          aggregate: (a) => ({
            total: a.sum('value'),
            average: a.avg('value'),
          }),
        }),
      ).toEqual(expected);
    },
  );
});
