import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';
import { createQueryOrdersCollection, seedQueryOrders } from './helpers.js';

describeIntegrationDatabases('query mutations', (context) => {
  it('inserts, updates, and deletes rows against a real connection', async () => {
    const ordersTable = context.table('queryOrders');

    await createQueryOrdersCollection(context);

    const insertResult = await context.database
      .query()
      .insertInto(ordersTable)
      .values([
        {
          orderNo: 'SO-001',
          status: 'draft',
          amount: 50,
          sort: 1,
          paidAt: null,
        },
        {
          orderNo: 'SO-002',
          status: 'paid',
          amount: 120,
          sort: 2,
          paidAt: '2026-08-14 10:00:00',
        },
        {
          orderNo: 'SO-003',
          status: 'paid',
          amount: 240,
          sort: 3,
          paidAt: '2026-08-14 11:00:00',
        },
      ])
      .execute();

    expect(insertResult.insertedCount).toBe(3);

    await expect(
      context.database
        .query()
        .updateTable(ordersTable)
        .set({ status: 'archived' })
        .where('status', '=', 'paid')
        .execute(),
    ).resolves.toEqual({ updatedCount: 2 });

    await expect(
      context.database
        .query()
        .deleteFrom(ordersTable)
        .where('status', '=', 'draft')
        .execute(),
    ).resolves.toEqual({ deletedCount: 1 });

    await expect(
      context.database
        .query()
        .selectFrom(ordersTable)
        .select(['orderNo', 'status'])
        .orderBy('orderNo')
        .execute(),
    ).resolves.toEqual([
      { orderNo: 'SO-002', status: 'archived' },
      { orderNo: 'SO-003', status: 'archived' },
    ]);
  });

  it('requires values, set data, or allowAllRows where appropriate', async () => {
    const ordersTable = context.table('queryOrders');

    await context.builder.createCollection('queryOrders', (collection) => {
      collection.increments('id');
      collection.string('status');
    });
    await context.database
      .query()
      .insertInto(ordersTable)
      .values([{ status: 'draft' }, { status: 'paid' }])
      .execute();

    await expect(
      context.database.query().insertInto(ordersTable).execute(),
    ).rejects.toThrow('insertInto().values() is required before execute().');

    await expect(
      context.database
        .query()
        .updateTable(ordersTable)
        .where('status', '=', 'paid')
        .execute(),
    ).rejects.toThrow('updateTable().set() is required before execute().');

    await expect(
      context.database
        .query()
        .updateTable(ordersTable)
        .set({ status: 'archived' })
        .execute(),
    ).rejects.toThrow(
      'updateTable().execute() requires where() or allowAllRows().',
    );

    await expect(
      context.database
        .query()
        .updateTable(ordersTable)
        .set({ status: 'archived' })
        .allowAllRows()
        .execute(),
    ).resolves.toEqual({ updatedCount: 2 });

    await expect(
      context.database.query().deleteFrom(ordersTable).execute(),
    ).rejects.toThrow(
      'deleteFrom().execute() requires where() or allowAllRows().',
    );

    await expect(
      context.database.query().deleteFrom(ordersTable).allowAllRows().execute(),
    ).resolves.toEqual({ deletedCount: 2 });
  });

  it('updates and deletes with expression callbacks and immutable clearWhere', async () => {
    const ordersTable = context.table('queryOrders');

    await createQueryOrdersCollection(context);
    await seedQueryOrders(context, ordersTable);

    const updatePaid = context.database
      .query()
      .updateTable(ordersTable)
      .set({ status: 'settled' })
      .where('status', '=', 'draft')
      .clearWhere()
      .where(({ eb }) =>
        eb.and([
          eb('status', '=', 'paid'),
          eb('amount', '>=', 100),
          eb('paidAt', 'is not', null),
        ]),
      );

    await expect(updatePaid.execute()).resolves.toEqual({ updatedCount: 2 });

    const deleteDrafts = context.database
      .query()
      .deleteFrom(ordersTable)
      .where('status', '=', 'settled')
      .clearWhere()
      .where(({ not }) => not((eb) => eb('status', '=', 'settled')));

    await expect(deleteDrafts.execute()).resolves.toEqual({ deletedCount: 1 });

    await expect(
      context.database
        .query()
        .selectFrom(ordersTable)
        .select(['orderNo', 'status'])
        .orderBy('orderNo')
        .execute(),
    ).resolves.toEqual([
      { orderNo: 'SO-002', status: 'settled' },
      { orderNo: 'SO-003', status: 'settled' },
    ]);
  });
});
