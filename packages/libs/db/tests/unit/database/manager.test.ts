import { describe, expect, it } from 'vitest';
import {
  CollectionNamingCompatibilityError,
  createDatabaseManager,
  defineDatabase,
  InMemoryCollectionMetadataStore,
  resolveDatabaseCapabilities,
  resolveKnexConnectionConfig,
} from '../../../src/index.js';

describe('DatabaseManager', () => {
  it('returns lazy builder, query, and connection handles for the default connection', async () => {
    const db = createDatabaseManager(
      defineDatabase({
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: ':memory:',
          },
        },
      }),
    );

    try {
      const connection = db.connection();
      expect(connection.name).toBe('main');
      expect(connection.driver).toBe('better-sqlite3');
      expect(connection.dialect).toBe('sqlite');
      expect(connection.capabilities.views).toBe(true);
      expect(connection.capabilities.materializedViews).toBe(false);
      expect(db.builder()).toBe(connection.builder);
      expect(db.query()).toBe(connection.query);

      await db.builder().createCollection('orders', (collection) => {
        collection.increments('id');
        collection.string('status');
      });

      const client = await connection.client<any>();
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
          dialect: 'sqlite',
          filename: ':memory:',
        },
        analytics: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });

    try {
      await db.builder('analytics').createCollection('events', (collection) => {
        collection.increments('id');
      });

      const main = await db.connection('main').client<any>();
      const analytics = await db.connection('analytics').client<any>();
      expect(await main.schema.hasTable('events')).toBe(false);
      expect(await analytics.schema.hasTable('events')).toBe(true);
    } finally {
      await db.destroy();
    }
  });

  it('accepts explicit drivers that match the dialect', async () => {
    const db = createDatabaseManager({
      connections: {
        sqlite: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: ':memory:',
        },
      },
    });

    try {
      expect(db.connection().driver).toBe('better-sqlite3');
    } finally {
      await db.destroy();
    }
  });

  it('executes query adapter operations against the selected connection', async () => {
    const db = createDatabaseManager({
      connections: {
        sqlite: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });

    try {
      await db.builder('sqlite').createCollection('orders', (collection) => {
        collection.increments('id');
        collection.string('status');
      });

      await db
        .query('sqlite')
        .insertInto('orders')
        .values({ status: 'paid' })
        .execute();
      await expect(
        db
          .query('sqlite')
          .selectFrom('orders')
          .select('status')
          .where('status', '=', 'paid')
          .execute(),
      ).resolves.toEqual([{ status: 'paid' }]);
    } finally {
      await db.destroy();
    }
  });

  it('passes connection naming options to builders', async () => {
    const db = createDatabaseManager({
      connections: {
        sqlite: {
          dialect: 'sqlite',
          filename: ':memory:',
          naming: {
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

      const client = await db.connection().client<any>();
      expect(await client.schema.hasTable('tbl_order_items')).toBe(true);
      expect(await client.schema.hasColumn('tbl_order_items', 'order_no')).toBe(
        true,
      );
    } finally {
      await db.destroy();
    }
  });

  it('passes underscored: false to builders and queries', async () => {
    const db = createDatabaseManager({
      connections: {
        sqlite: {
          dialect: 'sqlite',
          filename: ':memory:',
          naming: { underscored: false, tablePrefix: 'tbl_' },
        },
      },
    });

    try {
      await db.builder().createCollection('orderItems', (collection) => {
        collection.increments('id');
        collection.string('orderNo');
      });
      await db
        .query()
        .insertInto('tbl_orderItems')
        .values({ orderNo: 'SO-001' })
        .execute();

      await expect(
        db
          .query()
          .selectFrom('tbl_orderItems')
          .select('orderNo')
          .executeTakeFirst(),
      ).resolves.toEqual({ orderNo: 'SO-001' });
    } finally {
      await db.destroy();
    }
  });

  it('blocks connect when stored collection naming is incompatible', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const legacyDefinition = Object.assign(
      {
        name: 'orders',
        fields: [{ name: 'id', type: 'increments' as const }],
      },
      { tableName: 'legacy_orders' },
    );
    await metadataStore.saveCollection('orders', legacyDefinition);
    const db = createDatabaseManager({
      metadataStore,
      connections: {
        sqlite: { dialect: 'sqlite', filename: ':memory:' },
      },
    });

    try {
      await expect(db.connect()).rejects.toBeInstanceOf(
        CollectionNamingCompatibilityError,
      );
      expect(await metadataStore.getCollection('orders')).toHaveProperty(
        'tableName',
        'legacy_orders',
      );
    } finally {
      await db.destroy();
    }
  });

  it('runs builder and query operations inside one transaction connection', async () => {
    const db = createDatabaseManager({
      connections: {
        sqlite: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });

    try {
      await db.transaction(async (connection) => {
        await connection.builder.createCollection('orders', (collection) => {
          collection.increments('id');
          collection.string('status');
        });
        await connection.query
          .insertInto('orders')
          .values({ status: 'paid' })
          .execute();
      }, 'sqlite');

      await expect(
        db.query('sqlite').selectFrom('orders').select('status').execute(),
      ).resolves.toEqual([{ status: 'paid' }]);
    } finally {
      await db.destroy();
    }
  });

  it('disconnects and reconnects connections', async () => {
    const db = createDatabaseManager({
      connections: {
        sqlite: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });

    try {
      const firstClient = await db.connection('sqlite').client<any>();
      await db.disconnect('sqlite');
      const secondClient = await db.connection('sqlite').client<any>();
      expect(secondClient).not.toBe(firstClient);

      const reconnected = await db.reconnect('sqlite');
      expect(reconnected.name).toBe('sqlite');
    } finally {
      await db.destroy();
    }
  });

  it('reports configuration errors for missing connections and invalid database settings', () => {
    const empty = createDatabaseManager({
      connections: {},
    });
    expect(() => empty.connection()).toThrow(
      'No database connections configured.',
    );

    const missing = createDatabaseManager({
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });
    expect(() => missing.connection('analytics')).toThrow(
      'Database connection "analytics" is not configured.',
    );

    const invalidDriver = createDatabaseManager({
      connections: {
        main: {
          dialect: 'sqlite',
          driver: 'pg' as never,
          filename: ':memory:',
        },
      },
    });
    expect(() => invalidDriver.connection()).toThrow(
      'Invalid database driver "pg" for dialect "sqlite". Expected "better-sqlite3".',
    );

    const invalidDialect = createDatabaseManager({
      connections: {
        main: {
          dialect: 'custom',
          filename: ':memory:',
        } as never,
      },
    });
    expect(() => invalidDialect.connection()).toThrow(
      'Invalid database dialect "custom". Expected "sqlite", "postgres", or "mysql".',
    );

    const unsupportedUrl = createDatabaseManager({
      connections: {
        main: {
          dialect: 'postgres',
          url: 'postgres://user:password@127.0.0.1/app',
        } as never,
      },
    });
    expect(() => unsupportedUrl.connection()).toThrow(
      'Database connection config cannot include url. Use dialect and flattened connection parameters.',
    );

    const oldShape = createDatabaseManager({
      connections: {
        main: {
          dialect: 'postgres',
          client: 'pg',
          connection: {
            host: '127.0.0.1',
          },
        } as never,
      },
    });
    expect(() => oldShape.connection()).toThrow(
      'Database connection config cannot include client, connection. Use dialect and flattened connection parameters.',
    );

    const socketPathConflict = createDatabaseManager({
      connections: {
        main: {
          dialect: 'mysql',
          socketPath: '/tmp/mysql.sock',
          host: '127.0.0.1',
        } as never,
      },
    });
    expect(() => socketPathConflict.connection()).toThrow(
      'Database connection socketPath cannot be combined with host.',
    );

    const connectionStringEscapeHatch = createDatabaseManager({
      connections: {
        main: {
          dialect: 'postgres',
          host: '127.0.0.1',
          driverOptions: {
            connectionString: 'postgres://user:password@127.0.0.1/app',
          },
        },
      },
    });
    expect(() => connectionStringEscapeHatch.connection()).toThrow(
      'Database driverOptions cannot include connectionString. Use flattened connection parameters.',
    );
  });

  it('normalizes flattened configs into knex connection options', () => {
    expect(
      resolveKnexConnectionConfig({
        dialect: 'sqlite',
        filename: ':memory:',
        driverOptions: {
          verbose: true,
        },
      }).connection,
    ).toEqual({
      filename: ':memory:',
      verbose: true,
    });

    expect(
      resolveKnexConnectionConfig({
        dialect: 'postgres',
        host: '127.0.0.1',
        port: 5432,
        database: 'orders',
        username: 'orders_user',
        password: 'secret',
        ssl: {
          rejectUnauthorized: false,
        },
        driverOptions: {
          application_name: 'nocobase',
        },
      }).connection,
    ).toEqual({
      application_name: 'nocobase',
      host: '127.0.0.1',
      port: 5432,
      database: 'orders',
      user: 'orders_user',
      password: 'secret',
      ssl: {
        rejectUnauthorized: false,
      },
    });

    expect(
      resolveKnexConnectionConfig({
        dialect: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        database: 'orders',
        username: 'orders_user',
        password: 'secret',
        charset: 'utf8mb4',
        ssl: true,
        driverOptions: {
          decimalNumbers: true,
        },
      }).connection,
    ).toEqual({
      decimalNumbers: true,
      host: '127.0.0.1',
      port: 3306,
      database: 'orders',
      user: 'orders_user',
      password: 'secret',
      charset: 'utf8mb4',
      ssl: {},
    });

    expect(
      resolveKnexConnectionConfig({
        dialect: 'mysql',
        socketPath: '/tmp/mysql.sock',
        database: 'orders',
        username: 'orders_user',
        password: 'secret',
      }).connection,
    ).toEqual({
      socketPath: '/tmp/mysql.sock',
      database: 'orders',
      user: 'orders_user',
      password: 'secret',
    });
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
    expect(
      resolveDatabaseCapabilities('custom', { views: false }),
    ).toMatchObject({
      views: false,
      schemas: false,
    });
  });
});
