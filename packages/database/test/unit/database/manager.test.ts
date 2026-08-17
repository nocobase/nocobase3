import { describe, expect, it } from 'vitest';
import { createDatabaseManager, defineDatabase, resolveDatabaseCapabilities } from '../../../src/index.js';

describe('DatabaseManager', () => {
  it('returns lazy builder, query, and connection handles for the default connection', async () => {
    const db = createDatabaseManager(defineDatabase({
      default: 'main',
      connections: {
        main: {
          driver: 'knex',
          client: 'better-sqlite3',
          connection: {
            filename: ':memory:',
          },
          useNullAsDefault: true,
        },
      },
    }));

    try {
      const connection = db.connection();
      expect(connection.name).toBe('main');
      expect(connection.driver).toBe('knex');
      expect(connection.dialect).toBe('sqlite');
      expect(connection.capabilities.views).toBe(true);
      expect(connection.capabilities.materializedViews).toBe(false);
      expect(db.builder()).toBe(connection.builder);
      expect(db.query()).toBe(connection.query);

      await db.builder().createCollection('orders', (collection) => {
        collection.increments('id');
        collection.string('status');
      });

      const client = await db.client<any>();
      expect(await client.schema.hasTable('orders')).toBe(true);
    } finally {
      await db.destroy();
    }
  });

  it('resolves named connections independently', async () => {
    const db = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          driver: 'knex',
          client: 'better-sqlite3',
          connection: {
            filename: ':memory:',
          },
          useNullAsDefault: true,
        },
        analytics: {
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
      await db.builder('analytics').createCollection('events', (collection) => {
        collection.increments('id');
      });

      const main = await db.client<any>('main');
      const analytics = await db.client<any>('analytics');
      expect(await main.schema.hasTable('events')).toBe(false);
      expect(await analytics.schema.hasTable('events')).toBe(true);
    } finally {
      await db.destroy();
    }
  });

  it('executes query adapter operations against the selected connection', async () => {
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
      await db.builder('sqlite').createCollection('orders', (collection) => {
        collection.increments('id');
        collection.string('status');
      });

      await db.query('sqlite').insertInto('orders').values({ status: 'paid' }).execute();
      await expect(db.query('sqlite').selectFrom('orders').select('status').where('status', '=', 'paid').execute()).resolves.toEqual([
        { status: 'paid' },
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('passes connection naming options to builders', async () => {
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
      await db.builder().createCollection('orderItems', (collection) => {
        collection.increments('id');
        collection.string('orderNo');
      });

      const client = await db.client<any>();
      expect(await client.schema.hasTable('tbl_order_items')).toBe(true);
      expect(await client.schema.hasColumn('tbl_order_items', 'order_no')).toBe(true);
    } finally {
      await db.destroy();
    }
  });


  it('runs builder and query operations inside one transaction connection', async () => {
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
      await db.transaction(async (connection) => {
        await connection.builder.createCollection('orders', (collection) => {
          collection.increments('id');
          collection.string('status');
        });
        await connection.query.insertInto('orders').values({ status: 'paid' }).execute();
      }, 'sqlite');

      await expect(db.query('sqlite').selectFrom('orders').select('status').execute()).resolves.toEqual([
        { status: 'paid' },
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('disconnects and reconnects connections', async () => {
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
      const firstClient = await db.client<any>('sqlite');
      await db.disconnect('sqlite');
      const secondClient = await db.client<any>('sqlite');
      expect(secondClient).not.toBe(firstClient);

      const reconnected = await db.reconnect('sqlite');
      expect(reconnected.name).toBe('sqlite');
    } finally {
      await db.destroy();
    }
  });

  it('reports configuration errors for missing connections and unknown drivers', () => {
    const empty = createDatabaseManager({
      connections: {},
    });
    expect(() => empty.connection()).toThrow('No database connections configured.');

    const missing = createDatabaseManager({
      connections: {
        main: {
          driver: 'knex',
          client: 'better-sqlite3',
          connection: {
            filename: ':memory:',
          },
          useNullAsDefault: true,
        },
      },
    });
    expect(() => missing.connection('analytics')).toThrow('Database connection "analytics" is not configured.');

    const unknown = createDatabaseManager({
      connections: {
        main: {
          driver: 'custom' as 'knex',
          client: 'better-sqlite3',
        },
      },
    });
    expect(() => unknown.connection()).toThrow('Database driver "custom" is not registered.');
  });

  it('normalizes capabilities for supported dialects and overrides', () => {
    expect(resolveDatabaseCapabilities('postgres')).toMatchObject({
      schemas: true,
      materializedViews: true,
      refreshMaterializedViews: true,
      deferrableConstraints: true,
      partialIndexes: true,
      nativeTypes: true,
      comments: true,
    });
    expect(resolveDatabaseCapabilities('mysql')).toMatchObject({
      comments: true,
      nativeTypes: true,
      materializedViews: false,
    });
    expect(resolveDatabaseCapabilities('sqlite')).toMatchObject({
      partialIndexes: true,
      nativeTypes: false,
    });
    expect(resolveDatabaseCapabilities('custom', { views: false })).toMatchObject({
      views: false,
      schemas: false,
    });
  });
});
