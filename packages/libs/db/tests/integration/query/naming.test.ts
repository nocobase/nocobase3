import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('query naming', (context) => {
  it('keeps query select result keys aligned with the requested identifiers', async () => {
    await context.builder.createCollection('orderItems', (collection) => {
      collection.increments('id');
      collection.string('orderNo');
      collection.datetime('createdAt');
    });

    await context.database
      .query()
      .insertInto(context.table('orderItems'))
      .values({
        orderNo: 'SO-001',
        createdAt: '2026-08-13 00:00:00',
      })
      .execute();

    await expect(
      context.database
        .query()
        .selectFrom(context.table('orderItems'))
        .select(['orderNo', 'createdAt'])
        .where('orderNo', '=', 'SO-001')
        .executeTakeFirst(),
    ).resolves.toMatchObject({
      orderNo: 'SO-001',
      createdAt: expect.anything(),
    });

    await expect(
      context.database
        .query()
        .selectFrom(context.table('orderItems'))
        .select(['order_no', 'created_at'])
        .where('order_no', '=', 'SO-001')
        .executeTakeFirst(),
    ).resolves.toMatchObject({
      order_no: 'SO-001',
      created_at: expect.anything(),
    });
  });

  it('keeps explicit select aliases as result keys', async () => {
    await context.builder.createCollection('orderItems', (collection) => {
      collection.increments('id');
      collection.string('orderNo');
      collection.datetime('createdAt');
    });

    await context.database
      .query()
      .insertInto(context.table('orderItems'))
      .values({
        orderNo: 'SO-001',
        createdAt: '2026-08-13 00:00:00',
      })
      .execute();

    await expect(
      context.database
        .query()
        .selectFrom(`${context.table('orderItems')} as oi`)
        .select([
          'oi.id as item_id',
          'oi.orderNo as order_no',
          'oi.createdAt as created_at',
        ])
        .where('oi.orderNo', '=', 'SO-001')
        .executeTakeFirstOrThrow(),
    ).resolves.toMatchObject({
      item_id: expect.anything(),
      order_no: 'SO-001',
      created_at: expect.anything(),
    });

    await expect(
      context.database
        .query()
        .selectFrom(`${context.table('orderItems')} as oi`)
        .select([
          'oi.id as itemId',
          'oi.orderNo as orderNo',
          'oi.createdAt as createdAt',
        ])
        .where('oi.orderNo', '=', 'SO-001')
        .executeTakeFirstOrThrow(),
    ).resolves.toMatchObject({
      itemId: expect.anything(),
      orderNo: 'SO-001',
      createdAt: expect.anything(),
    });
  });

  it('maps camelCase table aliases when underscored naming is enabled', async () => {
    await context.builder.createCollection('orderItems', (collection) => {
      collection.increments('id');
      collection.string('orderNo');
      collection.datetime('createdAt');
    });

    await context.database
      .query()
      .insertInto(context.table('orderItems'))
      .values({
        orderNo: 'SO-001',
        createdAt: '2026-08-13 00:00:00',
      })
      .execute();

    await expect(
      context.database
        .query()
        .selectFrom(`${context.table('orderItems')} as orderItems`)
        .select([
          'orderItems.orderNo as orderNo',
          'orderItems.createdAt as createdAt',
        ])
        .where('orderItems.orderNo', '=', 'SO-001')
        .executeTakeFirstOrThrow(),
    ).resolves.toMatchObject({
      orderNo: 'SO-001',
      createdAt: expect.anything(),
    });
  });

  it('keeps low-level query table names separate from collection table prefixes', async () => {
    const tableName = `${context.prefix}_legacy_query_orders`;

    await context.builder.createCollection('queryOrders', (collection) => {
      collection.naming({ tablePrefix: `${context.prefix}_legacy_` });
      collection.increments('id');
      collection.string('orderNo');
      collection.datetime('createdAt');
    });

    await context.database
      .query()
      .insertInto(tableName)
      .values({
        orderNo: 'SO-001',
        createdAt: '2026-08-14 10:00:00',
      })
      .execute();

    await expect(
      context.database
        .query()
        .selectFrom(tableName)
        .select(['orderNo', 'createdAt'])
        .where('orderNo', '=', 'SO-001')
        .executeTakeFirst(),
    ).resolves.toMatchObject({
      orderNo: 'SO-001',
      createdAt: expect.anything(),
    });

    await expect(
      context.database
        .query()
        .selectFrom(tableName)
        .selectAll()
        .where('orderNo', '=', 'SO-001')
        .executeTakeFirst(),
    ).resolves.toMatchObject({
      orderNo: 'SO-001',
      createdAt: expect.anything(),
    });
  });
});
