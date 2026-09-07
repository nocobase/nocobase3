import { describe, expect, it } from 'vitest';
import { CollectionBuilder } from '../../../src/collection/builder/builder.js';
import type { CollectionDefinitionInput } from '../../../src/collection/types.js';

describe('CollectionBuilder createCollection', () => {
  it('tracks collection existence after executed operations', async () => {
    const builder = new CollectionBuilder();
    const definition: CollectionDefinitionInput = {
      fields: [{ name: 'id', type: 'increments' }],
    };

    await expect(builder.hasCollection('orders')).resolves.toBe(false);

    await builder.createCollection('previewOrders', definition, {
      dryRun: true,
    });
    await expect(builder.hasCollection('previewOrders')).resolves.toBe(false);

    await builder.createCollection('orders', definition);
    await expect(builder.hasCollection('orders')).resolves.toBe(true);

    await builder.dropCollection('orders');
    await expect(builder.hasCollection('orders')).resolves.toBe(false);
  });

  it('creates a collection from fluent input', async () => {
    const builder = new CollectionBuilder();

    const result = await builder.createCollection(
      'orders',
      (collection) => {
        collection.dbSchema('public');
        collection.naming({ tablePrefix: 'sales_' });
        collection.title('Orders');
        collection.description('Customer purchase orders.');
        collection.integer('version').notNull();
        collection.optimisticLock('version');
        collection.bigInt('id').primary().autoIncrement();
        collection
          .belongsTo('customer', 'customers')
          .targetKey('id')
          .foreignKeyType('bigInt')
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
          naming: { tablePrefix: 'sales_' },
          title: 'Orders',
          description: 'Customer purchase orders.',
          optimisticLock: { field: 'version', strategy: 'increment' },
          fields: [
            {
              name: 'version',
              type: 'integer',
              nullable: false,
            },
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
              targetKey: 'id',
              foreignKeyType: 'bigInt',
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
          { name: 'version', type: 'integer', nullable: false },
          { name: 'id', type: 'bigInt' },
          { name: 'customer_id', type: 'bigInt' },
          { name: 'amount', type: 'decimal', precision: 12, scale: 2 },
        ],
      },
    });
  });

  it('creates a collection from object input', async () => {
    const builder = new CollectionBuilder();

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
  });

  it('rejects invalid optimistic lock definitions before execution', async () => {
    const builder = new CollectionBuilder();

    await expect(
      builder.createCollection('orders', (collection) => {
        collection.string('version').notNull();
        collection.optimisticLock('version');
      }),
    ).rejects.toMatchObject({
      code: 'COLLECTION_RESOLUTION_FAILED',
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'COLLECTION_OPTIMISTIC_LOCK_INVALID',
        }),
      ]),
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
