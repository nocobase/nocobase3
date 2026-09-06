import { expect, it } from 'vitest';
import { commerceScenario } from '../../fixtures/scenarios/commerce.js';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('managed Collection resolution', (context) => {
  it(`resolves ${commerceScenario.name} from physical Schema and Metadata`, async () => {
    for (const collection of commerceScenario.collections) {
      await context.builder.createCollection(
        collection.name,
        structuredClone(collection.definition),
      );
    }

    const connection = context.database.connection(context.spec.name);
    for (const relation of commerceScenario.relations) {
      await connection.collectionMetadata.setRelation(
        relation.collection,
        relation.name,
        structuredClone(relation.relation),
      );
    }

    const orders = await connection.collections.get('orders');
    const physicalOrders = await connection.collections.getPhysical('orders');
    expect(physicalOrders?.tableName).toBe(context.table('orders'));
    const physicalAmount = physicalOrders?.columns.find(
      (column) => column.columnName === 'amount',
    );
    const amount = orders?.fields?.find((field) => field.name === 'amount');

    expect(orders).toMatchObject({
      name: 'orders',
      kind: 'table',
      title: 'Orders',
      description: 'Customer purchase orders.',
      fields: expect.arrayContaining([
        expect.objectContaining({
          name: 'customer',
          type: 'belongsTo',
          target: 'customers',
          foreignKey: 'customerId',
          targetKey: 'id',
          title: 'Customer',
        }),
      ]),
    });
    expect(physicalAmount).toBeDefined();
    expect(amount).toMatchObject({
      name: 'amount',
      type: 'decimal',
      nullable: physicalAmount?.nullable,
      title: 'Order amount',
    });
    expect(amount?.precision).toBe(physicalAmount?.precision);
    expect(amount?.scale).toBe(physicalAmount?.scale);
    await expect(
      connection.collections.validateRelations('orders'),
    ).resolves.toBeUndefined();
  });

  it('invalidates a cached resolved Collection after Metadata updates', async () => {
    await context.builder.createCollection('orders', {
      fields: [
        { name: 'id', type: 'increments', primaryKey: true },
        { name: 'amount', type: 'decimal', precision: 12, scale: 2 },
      ],
    });
    const connection = context.database.connection(context.spec.name);
    const before = await connection.collections.get('orders');
    expect(
      before?.fields?.find((field) => field.name === 'amount')?.title,
    ).toBeUndefined();

    await connection.collectionMetadata.updateCollection('orders', {
      title: 'Sales orders',
    });
    await connection.collectionMetadata.updateField('orders', 'amount', {
      title: 'Order amount',
      description: 'Total amount before refunds.',
    });

    const after = await connection.collections.get('orders');
    const physicalOrders = await connection.collections.getPhysical('orders');
    const physicalAmount = physicalOrders?.columns.find(
      (column) => column.columnName === 'amount',
    );
    const amount = after?.fields?.find((field) => field.name === 'amount');

    expect(after).toMatchObject({ title: 'Sales orders' });
    expect(physicalAmount).toBeDefined();
    expect(amount).toMatchObject({
      name: 'amount',
      type: 'decimal',
      nullable: physicalAmount?.nullable,
      title: 'Order amount',
      description: 'Total amount before refunds.',
    });
    expect(amount?.precision).toBe(physicalAmount?.precision);
    expect(amount?.scale).toBe(physicalAmount?.scale);
    expect(
      await context.db.schema.hasColumn(context.table('orders'), 'title'),
    ).toBe(false);
  });
});
