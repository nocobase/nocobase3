import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';
import { decimalResult } from './assertions.js';

describeIntegrationDatabases(
  'native decimal results and SQL cost',
  (context) => {
    it('preserves decimal values and avoids numeric metadata queries on native drivers', async () => {
      await context.builder.createCollection('nativeDecimals', (c) => {
        c.string('id').primary();
        c.decimal('amount', { precision: 30, scale: 6 });
      });
      const db = context.database;
      await db
        .query()
        .insertInto('nativeDecimals')
        .values({ id: 'A', amount: '9007199254740993.250000' })
        .execute();
      // SQLite REAL cannot represent this value; use an exact, scaled fixture there.
      if (context.spec.dialect === 'sqlite') {
        await context
          .db(context.table('nativeDecimals'))
          .update({ amount: '42.000000' });
      }
      const exact =
        context.spec.dialect === 'sqlite' ? '42' : '9007199254740993.25';
      const native = ['postgres', 'kingbase-postgres', 'mysql'].includes(
        context.spec.dialect,
      );
      const expected = native
        ? '9007199254740993.250000'
        : decimalResult(exact);
      const queries = [
        () =>
          db
            .query()
            .selectFrom('nativeDecimals as d')
            .select('d.amount as value'),
        () =>
          db
            .query()
            .selectFrom('nativeDecimals')
            .select((eb) => [eb.fn.min('amount').as('value')]),
        () =>
          db
            .query()
            .selectFrom('nativeDecimals')
            .select((eb) => [eb.fn.max('amount').as('value')]),
        () =>
          db
            .query()
            .selectFrom('nativeDecimals')
            .select((eb) => [
              eb.selectFrom('nativeDecimals').select('amount').as('value'),
            ]),
      ];
      for (const createQuery of queries) {
        db.connection().collections.invalidate('nativeDecimals');
        const statements: string[] = [];
        const listener = (query: { sql: string }) => statements.push(query.sql);
        context.db.on('query', listener);
        const query = createQuery();
        let rows;
        try {
          rows = await query.execute();
        } finally {
          context.db.off('query', listener);
        }
        expect(rows).toEqual([{ value: expected }]);
        if (native) {
          expect(statements).toEqual([query.compile().sql]);
          expect(statements[0]).not.toMatch(/\bcast\s*\(/i);
        }
      }
      db.connection().collections.invalidate('nativeDecimals');
      const countStatements: string[] = [];
      const countListener = (query: { sql: string }) =>
        countStatements.push(query.sql);
      context.db.on('query', countListener);
      try {
        expect(
          await db
            .query()
            .selectFrom('nativeDecimals')
            .select((eb) => [eb.fn.countAll().as('count')])
            .executeTakeFirstOrThrow(),
        ).toEqual({ count: 1 });
      } finally {
        context.db.off('query', countListener);
      }
      if (native) {
        expect(countStatements).toHaveLength(1);
        expect(countStatements[0]).not.toMatch(/\bcast\s*\(/i);
      }
      expect(
        await db.repository('nativeDecimals').findOne({ filter: { id: 'A' } }),
      ).toEqual({
        id: 'A',
        amount: expected,
      });
      expect(
        await db.repository('nativeDecimals').aggregate({
          aggregate: (a) => ({
            minimum: a.min('amount'),
            maximum: a.max('amount'),
          }),
        }),
      ).toEqual({ minimum: expected, maximum: expected });
    });

    it('returns decimal defaults without a PostgreSQL decimal reload', async () => {
      await context.builder.createCollection('nativeDefaults', (c) => {
        c.increments('id');
        c.decimal('amount', { precision: 20, scale: 6 }).defaultTo('42.000000');
      });
      const db = context.database;
      await db.connection().collections.get('nativeDefaults');
      const statements: string[] = [];
      const listener = (query: { sql: string }) => statements.push(query.sql);
      context.db.on('query', listener);
      let result;
      try {
        result = await db
          .repository('nativeDefaults')
          .createOne({ values: {} });
      } finally {
        context.db.off('query', listener);
      }
      expect(result.record.amount).toEqual(
        ['postgres', 'kingbase-postgres', 'mysql'].includes(
          context.spec.dialect,
        )
          ? '42.000000'
          : decimalResult('42'),
      );
      expect(result.record.id).toBeDefined();
      if (['postgres', 'kingbase-postgres'].includes(context.spec.dialect)) {
        // The final Repository selection still reads once, just as for integer fields.
        expect(statements.filter((sql) => /^select\b/i.test(sql))).toHaveLength(
          1,
        );
        expect(statements.filter((sql) => /^insert\b/i.test(sql))).toHaveLength(
          1,
        );
      }
    });
  },
);
