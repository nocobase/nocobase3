import { describe, expect, it } from 'vitest';
import {
  CollectionBuilder,
  CollectionNamingCompatibilityError,
  InMemoryCollectionMetadataStore,
} from '../../../src/index.js';

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
      collection.string('orderNo');
      collection.alterField('legacyStatus', { title: 'Legacy status' });
      collection.dropField('id');
      collection.index(['orderNo'], { name: 'idx_orders_order_no' });
      collection.unique(['orderNo'], { name: 'uk_orders_order_no' });
    });
    await builder.addField('orders', {
      name: 'paidAt',
      type: 'datetime',
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
        },
        {
          name: 'paidAt',
          nullable: false,
        },
      ],
      indexes: [],
      constraints: [],
    });
  });

  it('accepts redundant legacy mappings and removes them on the next metadata write', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const legacyField = Object.assign(
      { name: 'orderNo', type: 'string' as const },
      { columnName: 'order_no' },
    );
    const legacyDefinition = Object.assign(
      {
        name: 'orderItems',
        naming: Object.assign({ tablePrefix: 'tbl_' }, { underscored: true }),
        fields: [legacyField],
      },
      { tableName: 'tbl_order_items' },
    );
    await metadataStore.saveCollection('orderItems', legacyDefinition);
    const builder = new CollectionBuilder({
      metadataStore,
      naming: { tablePrefix: 'tbl_' },
    });

    await expect(
      builder.validateMetadataCompatibility(),
    ).resolves.toBeUndefined();
    await builder.updateCollectionMetadata('orderItems', {
      title: 'Order items',
    });

    const stored = await metadataStore.getCollection('orderItems');
    expect(stored).not.toHaveProperty('tableName');
    expect(stored?.naming).toMatchObject({
      underscored: true,
      tablePrefix: 'tbl_',
    });
    expect(stored?.fields?.[0]).not.toHaveProperty('columnName');
    expect(stored).toMatchObject({ title: 'Order items' });
  });

  it('reports incompatible legacy mappings without modifying metadata', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const legacyField = Object.assign(
      { name: 'orderNo', type: 'string' as const },
      { columnName: 'order_number' },
    );
    const legacyDefinition = Object.assign(
      {
        name: 'orders',
        naming: Object.assign({ tablePrefix: '' }, { underscored: false }),
        fields: [legacyField],
      },
      { tableName: 'legacy_sales_order' },
    );
    await metadataStore.saveCollection('orders', legacyDefinition);
    const builder = new CollectionBuilder({ metadataStore });

    const validation = builder.validateMetadataCompatibility();
    await expect(validation).rejects.toBeInstanceOf(
      CollectionNamingCompatibilityError,
    );
    await expect(validation).rejects.toMatchObject({
      code: 'COLLECTION_NAMING_INCOMPATIBLE',
      differences: expect.arrayContaining([
        expect.objectContaining({
          kind: 'tableName',
          collection: 'orders',
          legacyValue: 'legacy_sales_order',
          expectedValue: 'orders',
        }),
        expect.objectContaining({
          kind: 'columnName',
          collection: 'orders',
          field: 'orderNo',
          legacyValue: 'order_number',
          expectedValue: 'orderNo',
        }),
      ]),
    });
    await expect(
      builder.updateCollectionMetadata('orders', { title: 'Orders' }),
    ).rejects.toBeInstanceOf(CollectionNamingCompatibilityError);
    expect(await metadataStore.getCollection('orders')).toHaveProperty(
      'tableName',
      'legacy_sales_order',
    );
  });
});
