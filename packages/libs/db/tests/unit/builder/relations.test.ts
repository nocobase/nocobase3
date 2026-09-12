import { describe, expect, it } from 'vitest';
import { CollectionBuilder } from '../../../src/collection/builder/builder.js';

describe('CollectionBuilder relation fields', () => {
  it('compiles belongsTo as a local foreign key column with optional constraint', async () => {
    const builder = new CollectionBuilder();

    const result = await builder.createCollection(
      'orders',
      (collection) => {
        collection.increments('id');
        collection
          .belongsTo('customer', 'customers')
          .targetKey('id')
          .foreignKey('customerId')
          .foreignKeyType('integer')
          .constraints(true)
          .onDelete('cascade')
          .index();
      },
      { dryRun: true },
    );

    expect(result.schemaOperations?.[0]).toMatchObject({
      type: 'createTable',
      table: {
        columns: [
          { name: 'id', type: 'integer' },
          { name: 'customer_id', type: 'integer' },
        ],
        indexes: [
          {
            columns: ['customer_id'],
            name: 'idx_orders_customer_id',
          },
        ],
        constraints: [
          {
            type: 'foreignKey',
            columns: ['customer_id'],
            references: {
              table: 'customers',
              columns: ['id'],
            },
            onDelete: 'cascade',
          },
        ],
      },
    });
  });

  it('resolves relation keys through logical field names', async () => {
    const builder = new CollectionBuilder();

    const result = await builder.createCollection(
      'orders',
      (collection) => {
        collection.bigInt('createdById');
        collection
          .belongsTo('createdBy', 'users')
          .targetKey('id')
          .foreignKeyType('bigInt')
          .foreignKey('createdById')
          .constraints(true);
      },
      { dryRun: true },
    );

    expect(result.operations[0]).toMatchObject({
      type: 'createCollection',
      definition: {
        fields: expect.arrayContaining([
          expect.objectContaining({
            name: 'createdBy',
            foreignKey: 'createdById',
          }),
        ]),
      },
    });
    expect(result.schemaOperations?.[0]).toMatchObject({
      type: 'createTable',
      table: {
        columns: [{ name: 'created_by_id', type: 'bigInt' }],
        indexes: [
          {
            columns: ['created_by_id'],
            name: 'idx_orders_created_by_id',
          },
        ],
        constraints: [
          {
            type: 'foreignKey',
            columns: ['created_by_id'],
            references: {
              table: 'users',
              columns: ['id'],
            },
          },
        ],
      },
    });
  });

  it('keeps hasOne, hasMany, and belongsToMany as metadata-only relation fields', async () => {
    const builder = new CollectionBuilder();

    const result = await builder.createCollection(
      'customers',
      (collection) => {
        collection.increments('id');
        collection
          .hasOne('profile', 'profiles')
          .sourceKey('id')
          .foreignKey('customerId');
        collection
          .hasMany('orders', 'orders')
          .sourceKey('id')
          .foreignKey('customerId');
        collection
          .belongsToMany('products', 'products')
          .sourceKey('id')
          .targetKey('id')
          .through('orderProducts')
          .foreignKey('customerId')
          .otherKey('productId');
      },
      { dryRun: true },
    );

    expect(result.operations[0]).toMatchObject({
      type: 'createCollection',
      definition: {
        fields: expect.arrayContaining([
          expect.objectContaining({ name: 'profile', type: 'hasOne' }),
          expect.objectContaining({ name: 'orders', type: 'hasMany' }),
          expect.objectContaining({ name: 'products', type: 'belongsToMany' }),
        ]),
      },
    });
    expect(result.schemaOperations?.[0]).toMatchObject({
      type: 'createTable',
      table: {
        columns: [{ name: 'id' }],
      },
    });
    expect((result.schemaOperations?.[0] as any).table.columns).toHaveLength(1);
  });

  it('rejects legacy columnName on relation fields', async () => {
    const builder = new CollectionBuilder();

    await expect(
      builder.createCollection('orders', {
        fields: [
          {
            name: 'createdBy',
            type: 'belongsTo',
            target: 'users',
            columnName: 'creator_id',
          } as any,
        ],
      }),
    ).rejects.toThrow(/no longer supports columnName/);

    await expect(
      builder.apply([
        {
          type: 'addField',
          collection: 'orders',
          field: {
            name: 'createdBy',
            type: 'belongsTo',
            target: 'users',
            columnName: 'creator_id',
          } as any,
        },
      ]),
    ).rejects.toThrow(/no longer supports columnName/);
  });
});
