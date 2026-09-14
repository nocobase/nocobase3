import { beforeEach, expect, expectTypeOf, it } from 'vitest';
import type { AggregateExpression } from '../../../../db/src/query/types.js';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('safe numeric count results', (context) => {
  beforeEach(async () => {
    await context.builder.createCollection('countValues', (c) => {
      c.string('category');
      c.bigInt('value').nullable();
    });
  });

  it.each([false, true])(
    'returns numeric counts with aliases (empty: %s)',
    async (empty) => {
      const db = context.database;
      if (!empty)
        await db
          .query()
          .insertInto('countValues')
          .values([
            { category: 'A', value: '42' },
            { category: 'A', value: '42' },
            { category: 'A', value: null },
          ])
          .execute();
      const expected = { rows: empty ? 0 : 3, present: empty ? 0 : 2 };
      const row = await db
        .query()
        .selectFrom('countValues as v')
        .select((eb) => {
          expectTypeOf(eb.fn.countAll()).toEqualTypeOf<
            AggregateExpression<number>
          >();
          expectTypeOf(eb.fn.count('v.value')).toEqualTypeOf<
            AggregateExpression<number>
          >();
          return [
            eb.fn.countAll().as('rows'),
            eb.fn.count('v.value').as('present'),
            eb.fn.count('v.value').distinct().as('unique'),
          ];
        })
        .executeTakeFirstOrThrow();
      expect(row).toEqual({ ...expected, unique: empty ? 0 : 1 });
      const repository = db.repository('countValues');
      const count = await repository.count();
      expectTypeOf(count).toEqualTypeOf<number>();
      expect(count).toBe(expected.rows);
      const aggregate = await repository.aggregate({
        aggregate: (a) => ({ rows: a.count(), present: a.count('value') }),
      });
      expectTypeOf(aggregate.rows).toEqualTypeOf<number>();
      expect(aggregate).toEqual(expected);
    },
  );

  it('keeps grouped and scalar subquery counts numeric inside transactions', async () => {
    await context.database.transaction(async (connection) => {
      await connection.query
        .insertInto('countValues')
        .values([
          { category: 'A', value: '1' },
          { category: 'A', value: null },
          { category: 'B', value: '2' },
        ])
        .execute();
      const query = connection.query
        .selectFrom('countValues')
        .select((eb) => ['category', eb.fn.countAll().as('total')])
        .groupBy('category')
        .having('total', '>', 1)
        .orderBy('total');
      expect(await query.execute()).toEqual([{ category: 'A', total: 2 }]);
      expect(
        await connection.query
          .selectFrom('countValues')
          .select((eb) => [
            eb
              .selectFrom('countValues as nested')
              .select((inner) => [inner.fn.countAll().as('total')])
              .as('total'),
          ])
          .where('category', '=', 'B')
          .execute(),
      ).toEqual([{ total: 3 }]);
    });
    expect(
      await context.database.repository('countValues').groupBy({
        by: ['category'],
        aggregate: (a) => ({ total: a.count() }),
        sort: (s) => s.field('total').desc(),
      }),
    ).toEqual([
      { category: 'A', total: 2 },
      { category: 'B', total: 1 },
    ]);
  });
});
