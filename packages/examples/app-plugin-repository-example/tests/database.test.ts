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
    const result = await migrator.rollback();
    expect(result.rolledBack).toHaveLength(2);
    for (const name of [
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
