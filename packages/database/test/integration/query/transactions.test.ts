import { describe, expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('query transactions', (context) => {
  it('runs query operations inside transactions on a real connection', async () => {
    const ordersTable = context.table('queryOrders');

    await context.builder.createCollection('queryOrders', (collection) => {
      collection.increments('id');
      collection.string('orderNo');
      collection.string('status');
    });

    class ExpectedRollback extends Error {}

    await expect(
      context.database.transaction(async (connection) => {
        await connection.query
          .insertInto(ordersTable)
          .values({ orderNo: 'SO-rollback', status: 'draft' })
          .execute();

        await expect(
          connection.query
            .selectFrom(ordersTable)
            .where('orderNo', '=', 'SO-rollback')
            .exists(),
        ).resolves.toBe(true);

        throw new ExpectedRollback();
      }, context.spec.name),
    ).rejects.toBeInstanceOf(ExpectedRollback);

    await expect(
      context.database.query()
        .selectFrom(ordersTable)
        .where('orderNo', '=', 'SO-rollback')
        .exists(),
    ).resolves.toBe(false);

    await context.database.transaction(async (connection) => {
      await connection.query
        .insertInto(ordersTable)
        .values({ orderNo: 'SO-commit', status: 'paid' })
        .execute();
    }, context.spec.name);

    await expect(
      context.database.query()
        .selectFrom(ordersTable)
        .where('orderNo', '=', 'SO-commit')
        .value<string>('status'),
    ).resolves.toBe('paid');
  });
});
