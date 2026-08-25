import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('metadata-only operations', (context) => {
  it('registers a complete collection definition without creating its table', async () => {
    await context.builder.registerCollectionMetadata(
      'purchaseOrders',
      (collection) => {
        collection.string('id', { length: 64 }).notNull().primary();
        collection.string('attachmentId', { length: 64 }).nullable();
      },
    );

    expect(
      await context.db.schema.hasTable(context.table('purchaseOrders')),
    ).toBe(false);
    expect(context.builder.inspectCollection('purchaseOrders')).toMatchObject({
      definition: {
        name: 'purchaseOrders',
        fields: [
          expect.objectContaining({ name: 'id', type: 'string', length: 64 }),
          expect.objectContaining({
            name: 'attachmentId',
            type: 'string',
            length: 64,
          }),
        ],
      },
    });
  });

  it('updates metadata without changing database schema', async () => {
    await context.builder.createCollection('orders', (collection) => {
      collection.increments('id');
      collection.decimal('amount', { precision: 12, scale: 2 });
    });

    await context.builder.updateCollectionMetadata('orders', {
      title: 'Orders',
      description: 'Customer purchase orders.',
      fields: {
        amount: {
          title: 'Amount',
          description: 'Total order amount before refunds.',
        },
      },
    });

    expect(
      await context.db.schema.hasColumn(context.table('orders'), 'title'),
    ).toBe(false);

    const collection = await context.metadataStore.getCollection('orders');
    expect(collection).toMatchObject({
      title: 'Orders',
    });
    expect(
      collection?.fields?.find((field) => field.name === 'amount'),
    ).toMatchObject({
      name: 'amount',
      title: 'Amount',
      description: 'Total order amount before refunds.',
    });
  });

  it('renames and removes metadata without changing database schema', async () => {
    await context.builder.createCollection('legacyOrders', (collection) => {
      collection.increments('id');
    });

    await context.builder.renameCollectionMetadata('legacyOrders', 'orders');
    expect(
      await context.db.schema.hasTable(context.table('legacyOrders')),
    ).toBe(true);
    expect(await context.db.schema.hasTable(context.table('orders'))).toBe(
      false,
    );
    expect(context.builder.inspectCollection('legacyOrders')).toBeUndefined();
    expect(context.builder.inspectCollection('orders')).toMatchObject({
      tableName: context.table('legacyOrders'),
    });

    await context.builder.removeCollectionMetadata('orders');
    expect(
      await context.db.schema.hasTable(context.table('legacyOrders')),
    ).toBe(true);
    expect(context.builder.inspectCollection('orders')).toBeUndefined();
  });
});
