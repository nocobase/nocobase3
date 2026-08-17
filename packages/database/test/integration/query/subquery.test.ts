import { describe, expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('query subquery', (context) => {
  it('supports subquery operands, exists, and not exists against a real connection', async () => {
    const ordersTable = context.table('whereOrders');
    const paymentsTable = context.table('wherePayments');

    await context.builder.createCollection('whereOrders', (collection) => {
      collection.increments('id');
      collection.string('orderNo');
      collection.string('status');
    });
    await context.builder.createCollection('wherePayments', (collection) => {
      collection.increments('id');
      collection.integer('orderId');
      collection.string('status');
    });

    await context.database.query()
      .insertInto(ordersTable)
      .values([
        { orderNo: 'SO-001', status: 'created' },
        { orderNo: 'SO-002', status: 'created' },
        { orderNo: 'SO-003', status: 'created' },
        { orderNo: 'SO-004', status: 'created' },
      ])
      .execute();
    await context.database.query()
      .insertInto(paymentsTable)
      .values([
        { orderId: 1, status: 'paid' },
        { orderId: 2, status: 'failed' },
        { orderId: 3, status: 'paid' },
        { orderId: 3, status: 'failed' },
      ])
      .execute();

    await expect(
      context.database.query()
        .selectFrom(ordersTable)
        .where((eb) =>
          eb('id', 'in',
            eb.selectFrom(paymentsTable)
              .select('orderId')
              .where('status', '=', 'paid')
          )
        )
        .orderBy('orderNo')
        .pluck<string>('orderNo'),
    ).resolves.toEqual(['SO-001', 'SO-003']);

    await expect(
      context.database.query()
        .selectFrom(ordersTable)
        .where((eb) =>
          eb('id', 'not in',
            eb.selectFrom(paymentsTable)
              .select('orderId')
          )
        )
        .pluck<string>('orderNo'),
    ).resolves.toEqual(['SO-004']);

    await expect(
      context.database.query()
        .selectFrom(ordersTable)
        .select('orderNo')
        .where(({ exists, selectFrom }) =>
          exists(
            selectFrom(paymentsTable)
              .select('id')
              .whereRef(`${paymentsTable}.orderId`, '=', `${ordersTable}.id`)
              .where(`${paymentsTable}.status`, '=', 'paid')
          )
        )
        .orderBy('orderNo')
        .execute(),
    ).resolves.toEqual([
      { orderNo: 'SO-001' },
      { orderNo: 'SO-003' },
    ]);

    await expect(
      context.database.query()
        .selectFrom(ordersTable)
        .select('orderNo')
        .where(({ not, exists, selectFrom }) =>
          not(
            exists(
              selectFrom(paymentsTable)
                .select('id')
                .whereRef(`${paymentsTable}.orderId`, '=', `${ordersTable}.id`)
            )
          )
        )
        .execute(),
    ).resolves.toEqual([
      { orderNo: 'SO-004' },
    ]);
  });

  it('selects scalar subqueries with stable aliases', async () => {
    const ordersTable = context.table('whereOrders');
    const paymentsTable = context.table('wherePayments');

    await context.builder.createCollection('whereOrders', (collection) => {
      collection.increments('id');
      collection.string('orderNo');
      collection.string('status');
    });
    await context.builder.createCollection('wherePayments', (collection) => {
      collection.increments('id');
      collection.integer('orderId');
      collection.string('status');
    });

    await context.database.query()
      .insertInto(ordersTable)
      .values([
        { orderNo: 'SO-001', status: 'created' },
        { orderNo: 'SO-002', status: 'created' },
        { orderNo: 'SO-003', status: 'created' },
      ])
      .execute();
    await context.database.query()
      .insertInto(paymentsTable)
      .values([
        { orderId: 1, status: 'paid' },
        { orderId: 2, status: 'failed' },
        { orderId: 2, status: 'paid' },
      ])
      .execute();

    await expect(
      context.database.query()
        .selectFrom(ordersTable)
        .select((eb) => [
          'orderNo',
          eb.selectFrom(paymentsTable)
            .select('status')
            .whereRef(`${paymentsTable}.orderId`, '=', `${ordersTable}.id`)
            .orderBy(`${paymentsTable}.id`)
            .limit(1)
            .as('firstPaymentStatus'),
        ])
        .orderBy('orderNo')
        .execute(),
    ).resolves.toEqual([
      { orderNo: 'SO-001', firstPaymentStatus: 'paid' },
      { orderNo: 'SO-002', firstPaymentStatus: 'failed' },
      { orderNo: 'SO-003', firstPaymentStatus: null },
    ]);
  });
});
