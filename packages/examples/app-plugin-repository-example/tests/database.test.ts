// @vitest-environment node
import { expect, it } from 'vitest';
import { createFixture } from './helpers.js';
it('creates physical collections and relation metadata and rolls them back', async () => {
  const { database, migrator } = await createFixture();
  try {
    const collections = database.connection().collections;
    const orders = await collections.get('repositoryExampleOrders');
    expect(orders?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'customer',
          type: 'belongsTo',
          target: 'repositoryExampleCustomers',
        }),
        expect.objectContaining({
          name: 'items',
          type: 'hasMany',
          target: 'repositoryExampleOrderItems',
        }),
      ]),
    );
    expect(orders?.fields).toContainEqual(
      expect.objectContaining({ name: 'version', type: 'integer' }),
    );
    const physicalOrders = await collections.getPhysical(
      'repositoryExampleOrders',
    );
    expect(physicalOrders?.tableName).toBe('repository_example_orders');
    expect(physicalOrders?.foreignKeys).toEqual([
      expect.objectContaining({
        columns: ['customer_id'],
        referencedCollection: expect.objectContaining({
          tableName: 'repository_example_customers',
        }),
        onDelete: 'restrict',
      }),
    ]);
    const physicalItems = await collections.getPhysical(
      'repositoryExampleOrderItems',
    );
    expect(physicalItems?.foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ columns: ['order_id'], onDelete: 'cascade' }),
        expect.objectContaining({
          columns: ['product_id'],
          onDelete: 'restrict',
        }),
      ]),
    );
    const physicalProducts = await collections.getPhysical(
      'repositoryExampleProducts',
    );
    expect(physicalProducts?.indexes).toContainEqual(
      expect.objectContaining({
        unique: true,
        keys: [expect.objectContaining({ columnName: 'sku' })],
      }),
    );
    const atomic = await collections.getPhysical(
      'repositoryExampleAtomicCounters',
    );
    expect(atomic?.tableName).toBe('repository_example_atomic_counters');
    expect(atomic?.columns).toContainEqual(
      expect.objectContaining({
        columnName: 'value',
        dataType: 'integer',
        nullable: false,
      }),
    );
    const findMany = await collections.getPhysical(
      'repositoryExampleFindManyRecords',
    );
    expect(findMany?.tableName).toBe('repository_example_find_many_records');
    expect(findMany?.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columnName: 'sequence',
          dataType: 'integer',
          nullable: false,
        }),
        expect.objectContaining({ columnName: 'title', nullable: false }),
        expect.objectContaining({ columnName: 'category', nullable: false }),
        expect.objectContaining({
          columnName: 'description',
          nullable: false,
        }),
      ]),
    );
    expect(findMany?.indexes).toContainEqual(
      expect.objectContaining({
        unique: true,
        keys: [expect.objectContaining({ columnName: 'sequence' })],
      }),
    );
    const result = await migrator.rollback();
    expect(result.rolledBack).toHaveLength(3);
    for (const name of [
      'repositoryExampleFindManyRecords',
      'repositoryExampleAtomicCounters',
      'repositoryExampleCustomers',
      'repositoryExampleContacts',
      'repositoryExampleProducts',
      'repositoryExampleOrders',
      'repositoryExampleOrderItems',
    ]) {
      expect(await collections.get(name)).toBeUndefined();
      expect(await collections.getPhysical(name)).toBeUndefined();
    }
  } finally {
    await database.destroy();
  }
});
