import { decimalResult } from '../decimal/assertions.js';
import { beforeEach, expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('query bigint aggregates', (context) => {
  beforeEach(async () => {
    await context.builder.createCollection('bigintAggregates', (collection) => {
      collection.bigInt('amount').nullable();
    });
  });

  it.each([
    { label: 'small integers', values: ['42', '43'] },
    {
      label: 'large integers',
      values: ['9007199254740993', '9007199254740995'],
    },
    { label: 'null values', values: [null, null] },
    { label: 'empty input', values: [] },
  ])('aggregates $label', async ({ label, values }) => {
    const db = context.database;

    if (values.length > 0) {
      await db
        .query()
        .insertInto('bigintAggregates')
        .values(values.map((amount) => ({ amount })))
        .execute();
    }

    const result = await db
      .query()
      .selectFrom('bigintAggregates as item')
      .select((eb) => [
        eb.fn.countAll().as('rowCount'),
        eb.fn.count('item.amount').as('valueCount'),
        eb.fn.sum('item.amount').as('total'),
        eb.fn.min('item.amount').as('minimum'),
        eb.fn.max('item.amount').as('maximum'),
        eb.fn.avg('item.amount').as('average'),
      ])
      .executeTakeFirstOrThrow();

    const small = label === 'small integers';
    const empty = label === 'null values' || label === 'empty input';
    expect(result).toEqual({
      rowCount: values.length,
      valueCount: empty ? 0 : 2,
      total: decimalResult(empty ? null : small ? '85' : '18014398509481988'),
      minimum: empty ? null : small ? '42' : '9007199254740993',
      maximum: empty ? null : small ? '43' : '9007199254740995',
      average: decimalResult(
        empty ? null : small ? '42.5' : '9007199254740994',
      ),
    });
  });

  it('preserves AVG precision for an unsafe odd integer', async () => {
    const db = context.database;
    const amount = '9007199254740993';
    await db
      .query()
      .insertInto('bigintAggregates')
      .values({ amount })
      .execute();

    const result = await db
      .query()
      .selectFrom('bigintAggregates')
      .select((eb) => [eb.fn.avg('amount').as('average')])
      .executeTakeFirstOrThrow();

    expect(result).toEqual({ average: decimalResult('9007199254740993') });
  });
});
