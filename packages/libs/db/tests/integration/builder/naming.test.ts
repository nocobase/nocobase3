import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('naming conventions', (context) => {
  it('creates prefixed tables and underscored columns from collection names', async () => {
    await context.builder.createCollection('orderItems', (collection) => {
      collection.increments('id');
      collection.string('orderNo');
      collection.datetime('createdAt');
    });

    expect(await context.db.schema.hasTable(context.table('orderItems'))).toBe(
      true,
    );
    expect(
      await context.db.schema.hasColumn(
        context.table('orderItems'),
        'order_no',
      ),
    ).toBe(true);
    expect(
      await context.db.schema.hasColumn(
        context.table('orderItems'),
        'created_at',
      ),
    ).toBe(true);
  });

  it('allows a collection to override the connection table prefix', async () => {
    const tableName = `${context.prefix}_archive_order_items`;

    await context.builder.createCollection('orderItems', (collection) => {
      collection.naming({ tablePrefix: `${context.prefix}_archive_` });
      collection.increments('id');
      collection.string('orderNo');
      collection.datetime('createdAt');
    });

    expect(await context.db.schema.hasTable(tableName)).toBe(true);
    expect(await context.db.schema.hasColumn(tableName, 'order_no')).toBe(true);
    expect(await context.db.schema.hasColumn(tableName, 'created_at')).toBe(
      true,
    );

    await context.db(tableName).insert({
      order_no: 'SO-001',
    });
    await expect(context.db(tableName).select('order_no')).resolves.toEqual([
      {
        order_no: 'SO-001',
      },
    ]);
  });
});
