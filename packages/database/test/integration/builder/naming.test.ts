import { describe, expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('naming conventions', (context) => {
  it('creates prefixed tables and underscored columns from collection names', async () => {
    await context.builder.createCollection('orderItems', (collection) => {
      collection.increments('id');
      collection.string('orderNo');
      collection.datetime('createdAt');
    });

    expect(await context.db.schema.hasTable(context.table('orderItems'))).toBe(true);
    expect(await context.db.schema.hasColumn(context.table('orderItems'), 'order_no')).toBe(true);
    expect(await context.db.schema.hasColumn(context.table('orderItems'), 'created_at')).toBe(true);
  });

  it('uses explicit tableName and columnName as physical names', async () => {
    const tableName = context.identifier('legacy_order_item');

    await context.builder.createCollection('orderItems', (collection) => {
      collection.tableName(tableName);
      collection.increments('id');
      collection.string('orderNo').columnName('order_number');
      collection.datetime('createdAt');
    });

    expect(await context.db.schema.hasTable(tableName)).toBe(true);
    expect(await context.db.schema.hasColumn(tableName, 'order_number')).toBe(true);
    expect(await context.db.schema.hasColumn(tableName, 'created_at')).toBe(true);

    await context.db(tableName).insert({
      order_number: 'SO-001',
    });
    await expect(context.db(tableName).select('order_number')).resolves.toEqual([
      {
        order_number: 'SO-001',
      },
    ]);
  });
});
