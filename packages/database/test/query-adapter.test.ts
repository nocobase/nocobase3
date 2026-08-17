import { describe, expect, it } from 'vitest';
import { createDatabaseManager } from '../src/database.js';

describe('QueryAdapter', () => {
  it('runs raw queries and chained table operations against a real SQLite connection', async () => {
    const db = createDatabaseManager({
      connections: {
        sqlite: {
          driver: 'knex',
          client: 'better-sqlite3',
          connection: {
            filename: ':memory:',
          },
          useNullAsDefault: true,
        },
      },
    });

    try {
      await db.builder().createCollection('orders', (collection) => {
        collection.increments('id');
        collection.string('status');
        collection.integer('sort');
      });

      await expect(db.query().raw<Array<{ value: number }>>('select 1 as value')).resolves.toEqual([
        { value: 1 },
      ]);
      await db.query().table('orders').insert([
        { status: 'draft', sort: 1 },
        { status: 'paid', sort: 2 },
        { status: 'paid', sort: 3 },
      ]);

      await expect(db.query().table('orders').where('status', 'paid').update({ status: 'archived' })).resolves.toBe(2);
      await expect(db.query().table('orders').where('status', 'draft').delete()).resolves.toBe(1);
      await expect(
        db.query()
          .table('orders')
          .select('id', 'status', 'sort')
          .orderBy('sort', 'desc')
          .limit(1)
          .offset(0),
      ).resolves.toEqual([
        {
          id: 3,
          status: 'archived',
          sort: 3,
        },
      ]);
      await expect(db.query().table('orders').where('id', 2).first()).resolves.toMatchObject({
        id: 2,
        status: 'archived',
      });
    } finally {
      await db.destroy();
    }
  });

  it('normalizes query identifiers with underscored naming without applying tablePrefix', async () => {
    const db = createDatabaseManager({
      connections: {
        sqlite: {
          driver: 'knex',
          client: 'better-sqlite3',
          connection: {
            filename: ':memory:',
          },
          useNullAsDefault: true,
          naming: {
            underscored: true,
            tablePrefix: 'tbl_',
          },
        },
      },
    });

    try {
      const client = await db.client<any>();
      await client.schema.createTable('tbl_order_items', (table: any) => {
        table.increments('id');
        table.string('order_number');
        table.datetime('created_at');
      });

      await db.query().table('tblOrderItems').insert({
        orderNumber: 'SO-001',
        createdAt: '2026-08-13 00:00:00',
      });
      await db.query().table('tbl_order_items').insert({
        order_number: 'SO-002',
        created_at: '2026-08-14 00:00:00',
      });

      await expect(
        db.query()
          .table('tblOrderItems')
          .select(['id', 'orderNumber', 'createdAt'])
          .where('orderNumber', 'SO-001')
          .first(),
      ).resolves.toMatchObject({
        id: 1,
        orderNumber: 'SO-001',
        createdAt: expect.anything(),
      });
      await expect(
        db.query()
          .table('tbl_order_items')
          .select('order_number', 'created_at')
          .where({ order_number: 'SO-002' })
          .first(),
      ).resolves.toEqual({
        order_number: 'SO-002',
        created_at: expect.anything(),
      });
      expect(await client.schema.hasTable('order_items')).toBe(false);
    } finally {
      await db.destroy();
    }
  });
});
