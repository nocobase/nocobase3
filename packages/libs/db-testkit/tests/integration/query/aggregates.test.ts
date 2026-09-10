import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';
import { createQueryOrdersCollection, seedQueryOrders } from './helpers.js';

describeIntegrationDatabases('query aggregates', (context) => {
  it('supports groupBy, aggregate expressions, and having', async () => {
    const ordersTable = 'queryOrders';

    await createQueryOrdersCollection(context);
    await seedQueryOrders(context, ordersTable);

    const rows = await context.database
      .query()
      .selectFrom(ordersTable)
      .select((eb) => [
        'status',
        eb.fn.countAll<number>().as('total'),
        eb.fn.sum<number>('amount').as('amountTotal'),
      ])
      .groupBy('status')
      .having((eb) => eb(eb.fn.countAll<number>(), '>', 1))
      .execute<
        Array<{
          status: string;
          total: number | string | bigint;
          amountTotal: number | string;
        }>[number]
      >();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('paid');
    expect(Number(rows[0]?.total)).toBe(2);
    expect(Number(rows[0]?.amountTotal)).toBe(360);
  });

  it('supports count, count distinct, avg, min, max, and clearGroupBy/clearHaving', async () => {
    const ordersTable = 'queryOrders';

    await createQueryOrdersCollection(context);
    await seedQueryOrders(context, ordersTable);

    const aggregate = await context.database
      .query()
      .selectFrom(ordersTable)
      .select((eb) => [
        eb.fn.count<number>('id').as('rowCount'),
        eb.fn.count<number>('status').distinct().as('statusCount'),
        eb.fn.avg<number>('amount').as('avgAmount'),
        eb.fn.min<number>('amount').as('minAmount'),
        eb.fn.max<number>('amount').as('maxAmount'),
      ])
      .executeTakeFirstOrThrow<Record<string, number | string | bigint>>();

    expect(Number(aggregate.rowCount)).toBe(3);
    expect(Number(aggregate.statusCount)).toBe(2);
    expect(Number(aggregate.avgAmount)).toBeCloseTo(136.66666666666666, 3);
    expect(Number(aggregate.minAmount)).toBe(50);
    expect(Number(aggregate.maxAmount)).toBe(240);

    await expect(
      context.database
        .query()
        .selectFrom(ordersTable)
        .select((eb) => ['status', eb.fn.countAll<number>().as('total')])
        .groupBy('status')
        .having((eb) => eb(eb.fn.countAll<number>(), '>', 1))
        .clearGroupBy()
        .clearHaving()
        .clearSelect()
        .select((eb) => [eb.fn.countAll<number>().as('total')])
        .executeTakeFirstOrThrow<Record<string, number | string | bigint>>(),
    ).resolves.toMatchObject({
      total: expect.anything(),
    });
  });

  it('supports havingRef with mapped physical columns', async () => {
    const metricsTable = 'queryMetrics';

    await context.builder.createCollection('queryMetrics', (collection) => {
      collection.increments('id');
      collection.string('metricName');
      collection.integer('planned');
      collection.integer('actual');
    });
    await context.database
      .query()
      .insertInto(metricsTable)
      .values([
        { metricName: 'orders', planned: 10, actual: 12 },
        { metricName: 'payments', planned: 8, actual: 6 },
        { metricName: 'shipments', planned: 4, actual: 7 },
      ])
      .execute();

    await expect(
      context.database
        .query()
        .selectFrom(metricsTable)
        .select(['metricName', 'planned', 'actual'])
        .groupBy(['metricName', 'planned', 'actual'])
        .havingRef('actual', '>', 'planned')
        .orderBy('metricName')
        .execute(),
    ).resolves.toEqual([
      { metricName: 'orders', planned: 10, actual: 12 },
      { metricName: 'shipments', planned: 4, actual: 7 },
    ]);
  });
});
