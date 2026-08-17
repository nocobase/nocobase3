import { describe, expect, it } from 'vitest';
import { CollectionBuilder } from '../../src/builder.js';
import { InMemoryCollectionMetadataStore } from '../../src/metadata.js';

describe('CollectionBuilder metadata APIs', () => {
  it('updates collection metadata without schema operations', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const builder = new CollectionBuilder({ metadataStore });

    const result = await builder.updateCollectionMetadata('orders', {
      title: 'Orders',
      description: 'Customer purchase orders.',
      fields: {
        amount: {
          title: 'Amount',
          description: 'Total order amount before refunds.',
        },
      },
    });

    expect(result.schemaOperations).toEqual([]);
    expect(result.impact).toEqual([
      {
        level: 'safe',
        operation: 'updateCollectionMetadata',
        message: 'Only collection metadata will be updated.',
      },
    ]);
    expect(await metadataStore.getCollection('orders')).toMatchObject({
      name: 'orders',
      title: 'Orders',
      description: 'Customer purchase orders.',
      fields: [
        {
          name: 'amount',
          title: 'Amount',
          description: 'Total order amount before refunds.',
        },
      ],
    });
  });

  it('updates field metadata without schema operations', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const builder = new CollectionBuilder({ metadataStore });

    await builder.createCollection('orders', {
      fields: [
        { name: 'id', type: 'increments', primaryKey: true },
        { name: 'amount', type: 'decimal', precision: 12, scale: 2 },
      ],
    });

    const result = await builder.updateFieldMetadata('orders', 'amount', {
      title: 'Amount',
      description: 'Total order amount before refunds.',
    });

    expect(result.schemaOperations).toEqual([]);
    expect(await metadataStore.getCollection('orders')).toMatchObject({
      fields: [
        { name: 'id' },
        {
          name: 'amount',
          title: 'Amount',
          description: 'Total order amount before refunds.',
        },
      ],
    });
  });

  it('syncs metadata for schema-changing field, index, and constraint operations', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const builder = new CollectionBuilder({ metadataStore });

    await builder.createCollection('orders', {
      fields: [
        { name: 'id', type: 'increments', primaryKey: true },
        { name: 'legacyStatus', type: 'string' },
      ],
    });

    await builder.alterCollection('orders', (collection) => {
      collection.string('orderNo').columnName('order_number');
      collection.alterField('legacyStatus', { title: 'Legacy status' });
      collection.dropField('id');
      collection.index(['orderNo'], { name: 'idx_orders_order_no' });
      collection.unique(['orderNo'], { name: 'uk_orders_order_no' });
    });
    await builder.addField('orders', {
      name: 'paidAt',
      type: 'datetime',
      columnName: 'paid_at',
    });
    await builder.alterField('orders', 'paidAt', {
      nullable: false,
    });
    await builder.dropField('orders', 'legacyStatus');
    await builder.dropIndex('orders', 'idx_orders_order_no');
    await builder.dropConstraint('orders', 'uk_orders_order_no');

    expect(await metadataStore.getCollection('orders')).toMatchObject({
      fields: [
        {
          name: 'orderNo',
          columnName: 'order_number',
        },
        {
          name: 'paidAt',
          columnName: 'paid_at',
          nullable: false,
        },
      ],
      indexes: [],
      constraints: [],
    });
  });
});
