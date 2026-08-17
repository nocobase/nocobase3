import { describe, expect, it } from 'vitest';
import { CollectionBuilder } from '../../../src/index.js';

describe('CollectionBuilder naming', () => {
  it('applies connection naming to inferred table and column names', async () => {
    const builder = new CollectionBuilder({
      naming: {
        underscored: true,
        tablePrefix: 'tbl_',
      },
    });

    const result = await builder.createCollection(
      'orderItems',
      (collection) => {
        collection.increments('id');
        collection.string('orderNo');
        collection.datetime('createdAt');
        collection.belongsTo('createdBy', 'users').foreignKeyType('integer').constraints(true);
        collection.unique(['orderNo', 'createdAt']);
      },
      { dryRun: true },
    );

    const operation = result.schemaOperations?.[0];
    expect(operation).toMatchObject({
      type: 'createTable',
      table: {
        name: 'tbl_order_items',
      },
    });
    if (operation?.type !== 'createTable') {
      throw new Error('Expected createTable schema operation.');
    }
    expect(operation.table.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'order_no', type: 'string' }),
      expect.objectContaining({ name: 'created_at', type: 'datetime' }),
      expect.objectContaining({ name: 'created_by_id', type: 'integer' }),
    ]));
    expect(operation.table.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'unique',
        columns: ['order_no', 'created_at'],
        name: 'idx_tbl_order_items_order_no_created_at',
      }),
      expect.objectContaining({
        type: 'foreignKey',
        columns: ['created_by_id'],
        references: {
          table: 'tbl_users',
          columns: ['id'],
        },
      }),
    ]));
    expect(operation.table.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        columns: ['created_by_id'],
      }),
    ]));
  });

  it('uses explicit tableName and columnName before naming convention', async () => {
    const builder = new CollectionBuilder({
      naming: {
        underscored: true,
        tablePrefix: 'tbl_',
      },
    });

    const result = await builder.createCollection(
      'orderItems',
      (collection) => {
        collection.tableName('legacy_order_item');
        collection.string('orderNo').columnName('order_number');
        collection.datetime('createdAt');
        collection.bigInt('createdById').columnName('creator_id');
        collection.belongsTo('createdBy', 'users').foreignKey('createdById').constraints(true);
        collection.index(['orderNo', 'createdAt']);
      },
      { dryRun: true },
    );

    expect(result.operations[0]).toMatchObject({
      type: 'createCollection',
      definition: {
          tableName: 'legacy_order_item',
          fields: expect.arrayContaining([
            expect.objectContaining({ name: 'orderNo', columnName: 'order_number' }),
            expect.objectContaining({ name: 'createdById', columnName: 'creator_id' }),
            expect.objectContaining({ name: 'createdBy', foreignKey: 'createdById' }),
          ]),
        },
    });
    const operation = result.schemaOperations?.[0];
    expect(operation).toMatchObject({
      type: 'createTable',
      table: {
        name: 'legacy_order_item',
      },
    });
    if (operation?.type !== 'createTable') {
      throw new Error('Expected createTable schema operation.');
    }
    expect(operation.table.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'order_number', type: 'string' }),
      expect.objectContaining({ name: 'created_at', type: 'datetime' }),
      expect.objectContaining({ name: 'creator_id', type: 'bigInt' }),
    ]));
    expect(operation.table.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        columns: ['order_number', 'created_at'],
        name: 'idx_legacy_order_item_order_number_created_at',
      }),
    ]));
  });

  it('allows collection naming to override connection naming', async () => {
    const builder = new CollectionBuilder({
      naming: {
        underscored: true,
        tablePrefix: 'tbl_',
      },
    });

    const result = await builder.createCollection(
      'orderItems',
      (collection) => {
        collection.naming({
          underscored: false,
          tablePrefix: 'legacy_',
        });
        collection.datetime('createdAt');
      },
      { dryRun: true },
    );

    expect(result.schemaOperations?.[0]).toMatchObject({
      type: 'createTable',
      table: {
        name: 'legacy_orderItems',
        columns: [{ name: 'createdAt', type: 'datetime' }],
      },
    });
  });

  it('uses metadata columnName when altering and dropping fields', async () => {
    const builder = new CollectionBuilder();

    await builder.createCollection('orders', {
      tableName: 'legacy_orders',
      fields: [
        { name: 'orderNo', type: 'string', columnName: 'order_number' },
      ],
    });

    const drop = await builder.dropField('orders', 'orderNo', { dryRun: true });
    const alter = await builder.alterField('orders', 'orderNo', { nullable: false }, { dryRun: true });

    expect(drop.schemaOperations?.[0]).toMatchObject({
      type: 'alterTable',
      tableName: 'legacy_orders',
      operations: [{ type: 'dropColumn', column: 'order_number' }],
    });
    expect(alter.schemaOperations?.[0]).toMatchObject({
      type: 'alterTable',
      tableName: 'legacy_orders',
      operations: [{ type: 'alterColumn', column: 'order_number' }],
    });
  });

  it('uses metadata tableName and columnName for foreign keys and structured views', async () => {
    const builder = new CollectionBuilder();

    await builder.createCollection('legacyUsers', {
      tableName: 'app_users',
      fields: [
        { name: 'userId', type: 'integer', columnName: 'user_id', primaryKey: true },
        { name: 'displayName', type: 'string', columnName: 'display_name' },
        { name: 'isActive', type: 'boolean', columnName: 'is_active' },
      ],
    });

    const orders = await builder.createCollection(
      'orders',
      (collection) => {
        collection.integer('createdBy').references({
          collection: 'legacyUsers',
          field: 'userId',
        });
      },
      { dryRun: true },
    );
    const view = await builder.createViewCollection(
      'activeUsers',
      (collection) => {
        collection.tableName('active_users');
        collection.string('displayName', { columnName: 'display_name' });
        collection.as((query) =>
          query
            .from('legacyUsers')
            .select('displayName')
            .where('isActive', '=', true),
        );
      },
      { dryRun: true },
    );

    expect(orders.schemaOperations?.[0]).toMatchObject({
      type: 'createTable',
      table: {
        constraints: [
          expect.objectContaining({
            type: 'foreignKey',
            columns: ['created_by'],
            references: {
              table: 'app_users',
              columns: ['user_id'],
            },
          }),
        ],
      },
    });
    expect(view.schemaOperations?.[0]).toMatchObject({
      type: 'createView',
      view: {
        query: {
          from: 'app_users',
          select: ['display_name'],
          filter: {
            is_active: {
              $eq: true,
            },
          },
        },
      },
    });
  });

  it('treats relation parameters as logical collection and field names', async () => {
    const builder = new CollectionBuilder({
      naming: {
        underscored: true,
        tablePrefix: 'tbl_',
      },
    });

    await builder.createCollection('users', {
      tableName: 'app_users',
      fields: [
        { name: 'userId', type: 'integer', columnName: 'user_pk', primaryKey: true },
      ],
    });

    const result = await builder.createCollection(
      'orders',
      (collection) => {
        collection.integer('createdById').columnName('creator_id');
        collection.belongsTo('createdBy', 'users').foreignKey('createdById').targetKey('userId').constraints(true);
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
            targetKey: 'userId',
          }),
        ]),
      },
    });
    expect(result.operations[0]).not.toMatchObject({
      definition: {
        fields: expect.arrayContaining([
          expect.objectContaining({
            name: 'createdBy',
            columnName: 'createdById',
          }),
        ]),
      },
    });
    expect(result.schemaOperations?.[0]).toMatchObject({
      type: 'createTable',
      table: {
        columns: [
          expect.objectContaining({ name: 'creator_id' }),
        ],
        constraints: [
          expect.objectContaining({
            type: 'foreignKey',
            columns: ['creator_id'],
            references: {
              table: 'app_users',
              columns: ['user_pk'],
            },
          }),
        ],
      },
    });
  });
});
