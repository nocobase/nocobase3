import { describe, expect, it } from 'vitest';
import { CollectionBuilder } from '../../../src/collection/builder/builder.js';

describe('CollectionBuilder naming', () => {
  it('applies connection naming to deterministic table and column names', async () => {
    const builder = new CollectionBuilder({ naming: { tablePrefix: 'tbl_' } });
    const result = await builder.createCollection(
      'orderItems',
      (collection) => {
        collection.increments('id');
        collection.string('orderNo');
        collection.datetime('createdAt');
        collection
          .belongsTo('createdBy', 'users')
          .targetKey('id')
          .foreignKey('createdBy_id')
          .foreignKeyType('bigInt')
          .constraints(true);
        collection.unique(['orderNo', 'createdAt']);
      },
      { dryRun: true },
    );

    expect(result.schemaOperations?.[0]).toMatchObject({
      type: 'createTable',
      table: {
        name: 'tbl_order_items',
        columns: expect.arrayContaining([
          expect.objectContaining({ name: 'order_no' }),
          expect.objectContaining({ name: 'created_at' }),
          expect.objectContaining({ name: 'created_by_id' }),
        ]),
      },
    });
  });

  it('allows collection naming to override or clear the connection prefix', async () => {
    const builder = new CollectionBuilder({ naming: { tablePrefix: 'tbl_' } });
    const overridden = await builder.createCollection(
      'auditLogs',
      (collection) => {
        collection.naming({ tablePrefix: 'archive_' });
        collection.datetime('createdAt');
      },
      { dryRun: true },
    );
    const cleared = await builder.createCollection(
      'systemLogs',
      (collection) => {
        collection.naming({ tablePrefix: '' });
        collection.datetime('createdAt');
      },
      { dryRun: true },
    );

    expect(overridden.schemaOperations?.[0]).toMatchObject({
      type: 'createTable',
      table: { name: 'archive_audit_logs' },
    });
    expect(cleared.schemaOperations?.[0]).toMatchObject({
      type: 'createTable',
      table: { name: 'system_logs' },
    });
  });

  it('allows a collection to override the connection underscored option', async () => {
    const builder = new CollectionBuilder({
      naming: { underscored: true, tablePrefix: 'tbl_' },
    });
    const result = await builder.createCollection(
      'orderItems',
      (collection) => {
        collection.naming({ underscored: false, tablePrefix: 'legacy_' });
        collection.datetime('createdAt');
        collection
          .belongsTo('createdBy', 'users')
          .targetKey('id')
          .foreignKey('createdBy_id')
          .foreignKeyType('bigInt');
      },
      { dryRun: true },
    );

    expect(result.schemaOperations?.[0]).toMatchObject({
      type: 'createTable',
      table: {
        name: 'legacy_orderItems',
        columns: expect.arrayContaining([
          expect.objectContaining({ name: 'createdAt' }),
          expect.objectContaining({ name: 'createdBy_id' }),
        ]),
      },
    });
  });

  it('uses target collection naming for foreign keys and structured views', async () => {
    const builder = new CollectionBuilder({ naming: { tablePrefix: 'app_' } });
    await builder.createCollection('users', (collection) => {
      collection.naming({ tablePrefix: 'auth_' });
      collection.integer('userId').primary();
      collection.string('displayName');
      collection.boolean('isActive');
    });

    const orders = await builder.createCollection(
      'orders',
      (collection) => {
        collection.integer('createdById').references({
          collection: 'users',
          field: 'userId',
        });
      },
      { dryRun: true },
    );
    const view = await builder.createViewCollection(
      'activeUsers',
      (collection) => {
        collection.string('displayName');
        collection.as((query) =>
          query
            .from('users')
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
            references: { table: 'auth_users', columns: ['user_id'] },
          }),
        ],
      },
    });
    expect(view.schemaOperations?.[0]).toMatchObject({
      type: 'createView',
      view: {
        name: 'app_active_users',
        query: {
          from: 'auth_users',
          select: ['display_name'],
          filter: { is_active: { $eq: true } },
        },
      },
    });
  });

  it('rejects legacy physical mappings in new collection input', async () => {
    const builder = new CollectionBuilder();
    const legacyCollection = Object.assign(
      { fields: [{ name: 'id', type: 'increments' as const }] },
      { tableName: 'legacy_orders' },
    );
    const legacyField = Object.assign(
      { name: 'orderNo', type: 'string' as const },
      { columnName: 'order_number' },
    );

    await expect(
      builder.createCollection('orders', legacyCollection),
    ).rejects.toThrow(/no longer supports tableName/);
    await expect(
      builder.createCollection('orders', { fields: [legacyField] }),
    ).rejects.toThrow(/no longer supports columnName/);
  });
});
