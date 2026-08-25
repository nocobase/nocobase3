import { describe, expect, it } from 'vitest';
import { CollectionBuilder } from '../../../src/index.js';
import { InMemoryCollectionMetadataStore } from '../../../src/index.js';

describe('CollectionBuilder createCollection', () => {
  it('creates a collection from fluent input', async () => {
    const builder = new CollectionBuilder();

    const result = await builder.createCollection(
      'orders',
      (collection) => {
        collection.dbSchema('public');
        collection.tableName('sales_orders');
        collection.title('Orders');
        collection.description('Customer purchase orders.');
        collection.bigInt('id').primary().autoIncrement();
        collection
          .belongsTo('customer', 'customers')
          .foreignKey('customerId')
          .index();
        collection.decimal('amount', { precision: 12, scale: 2 }).notNull();
      },
      { dryRun: true },
    );

    expect(result.operations).toEqual([
      {
        type: 'createCollection',
        name: 'orders',
        definition: {
          db: { schema: 'public' },
          tableName: 'sales_orders',
          title: 'Orders',
          description: 'Customer purchase orders.',
          fields: [
            {
              name: 'id',
              type: 'bigInt',
              primaryKey: true,
              autoIncrement: true,
            },
            {
              name: 'customer',
              type: 'belongsTo',
              target: 'customers',
              foreignKey: 'customerId',
              index: true,
            },
            {
              name: 'amount',
              type: 'decimal',
              precision: 12,
              scale: 2,
              nullable: false,
            },
          ],
          constraints: [
            {
              type: 'primary',
              fields: ['id'],
            },
          ],
          indexes: [
            {
              fields: ['customer'],
            },
          ],
        },
      },
    ]);
    expect(result.schemaOperations?.[0]).toMatchObject({
      type: 'createTable',
      table: {
        name: 'sales_orders',
        db: { schema: 'public' },
        columns: [
          { name: 'id', type: 'bigInt' },
          { name: 'customer_id', type: 'bigInt' },
          { name: 'amount', type: 'decimal', precision: 12, scale: 2 },
        ],
      },
    });
  });

  it('creates a collection from object input and syncs metadata by default', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const builder = new CollectionBuilder({ metadataStore });

    const result = await builder.createCollection('orders', {
      title: 'Orders',
      description: 'Customer purchase orders.',
      fields: [
        {
          name: 'id',
          type: 'increments',
          primaryKey: true,
        },
        {
          name: 'amount',
          type: 'decimal',
          precision: 12,
          scale: 2,
          title: 'Amount',
        },
      ],
    });

    expect(result.schemaOperations?.[0]).toMatchObject({
      type: 'createTable',
      table: {
        name: 'orders',
        columns: [
          {
            name: 'id',
            type: 'integer',
            primaryKey: true,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 12,
            scale: 2,
          },
        ],
      },
    });
    expect(await metadataStore.getCollection('orders')).toMatchObject({
      name: 'orders',
      title: 'Orders',
      fields: [
        { name: 'id', type: 'increments' },
        { name: 'amount', title: 'Amount' },
      ],
    });
  });

  it('passes idempotent create and drop options to schema operations', async () => {
    const builder = new CollectionBuilder();

    const create = await builder.createCollection(
      'appSettings',
      (collection) => {
        collection.increments('id');
      },
      {
        dryRun: true,
        ifNotExists: true,
      },
    );
    const drop = await builder.dropCollection('appSettings', {
      dryRun: true,
      ifExists: true,
    });

    expect(create.operations[0]).toMatchObject({
      type: 'createCollection',
      ifNotExists: true,
    });
    expect(create.schemaOperations?.[0]).toMatchObject({
      type: 'createTable',
      ifNotExists: true,
    });
    expect(drop.operations[0]).toMatchObject({
      type: 'dropCollection',
      ifExists: true,
    });
    expect(drop.schemaOperations?.[0]).toMatchObject({
      type: 'dropTable',
      ifExists: true,
    });
  });
});
