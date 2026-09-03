import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  CollectionRenameAtomicityError,
  DatabaseCollectionMetadataStore,
  createDatabaseManager,
  defineDatabase,
  InMemoryCollectionMetadataStore,
  ModuleCollectionMetadataStore,
  resolveDatabaseCapabilities,
  resolveKnexConnectionConfig,
  SchemaManagementNotAllowedError,
  type DatabaseConnection,
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
      expect(connection.schemaManagement).toBe('managed');
      expect(connection.capabilities.views).toBe(true);
      expect(connection.capabilities.materializedViews).toBe(false);
      expect(db.builder()).toBe(connection.builder);
      expect(db.query()).toBe(connection.query);
      expect(connection.collections).toBeDefined();
      expect(connection.collectionMetadata).toBeDefined();

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

  it('resolves Collections and updates supplemental Metadata through Connection entry points', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const db = createDatabaseManager({
      metadataStore,
      connections: {
        sqlite: { dialect: 'sqlite', filename: ':memory:' },
      },
    });

    try {
      const connection = db.connection();
      await connection.builder.createCollection('orders', (collection) => {
        collection.title('Orders');
        collection.increments('id');
        collection.decimal('amount').title('Amount before tax');
      });

      await expect(metadataStore.get('orders')).resolves.toEqual({
        document: {
          version: 1,
          name: 'orders',
          title: 'Orders',
          fields: { amount: { title: 'Amount before tax' } },
        },
        revision: 1,
      });

      const physical = await connection.collections.get('orders');
      expect(physical).toMatchObject({
        name: 'orders',
        fields: expect.arrayContaining([
          expect.objectContaining({ name: 'amount' }),
        ]),
      });

      const stored = await connection.collectionMetadata.updateField(
        'orders',
        'amount',
        { title: 'Amount' },
      );
      expect(stored?.revision).toBe(2);
      await expect(connection.collections.get('orders')).resolves.toMatchObject(
        {
          fields: expect.arrayContaining([
            expect.objectContaining({ name: 'amount', title: 'Amount' }),
          ]),
        },
      );
      await expect(connection.collections.list()).resolves.toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({ name: 'orders', tableName: 'orders' }),
        ]),
      });

      await connection.builder.addField('orders', {
        name: 'status',
        type: 'string',
        title: 'Status',
      });
      await expect(connection.collections.get('orders')).resolves.toMatchObject(
        {
          fields: expect.arrayContaining([
            expect.objectContaining({ name: 'status', title: 'Status' }),
          ]),
        },
      );
      const afterAdd = await metadataStore.get('orders');
      expect(afterAdd?.document).toEqual({
        version: 1,
        name: 'orders',
        title: 'Orders',
        fields: {
          amount: { title: 'Amount' },
          status: { title: 'Status' },
        },
      });
      expect(afterAdd?.document).not.toHaveProperty('indexes');
      expect(afterAdd?.document.fields?.status).not.toHaveProperty('type');

      await connection.builder.dropField('orders', 'status');
      expect(
        (await metadataStore.get('orders'))?.document.fields,
      ).not.toHaveProperty('status');
    } finally {
      await db.destroy();
    }
  });

  it('uses persistent Database Metadata by default and hides its internal table', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nocobase-db-metadata-'));
    const filename = path.join(directory, 'database.sqlite');
    const db = createDatabaseManager({
      connections: {
        sqlite: { dialect: 'sqlite', filename },
      },
    });

    try {
      const connection = db.connection();
      await connection.builder.createCollection('orders', (collection) => {
        collection.title('Orders');
        collection.increments('id');
      });
      const client = await connection.client<any>();
      expect(
        await client.schema.hasTable('__nocobase_collection_metadata'),
      ).toBe(true);
      await expect(connection.collections.list({ limit: 1 })).resolves.toEqual({
        items: [expect.objectContaining({ name: 'orders', title: 'Orders' })],
      });
      const scanned: string[] = [];
      for await (const collection of connection.collections.scan({
        pageSize: 1,
      })) {
        scanned.push(collection.name!);
      }
      expect(scanned).toEqual(['orders']);

      await db.reconnect();
      await expect(
        db.connection().collections.get('orders'),
      ).resolves.toMatchObject({ name: 'orders', title: 'Orders' });
    } finally {
      await db.destroy();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('blocks schema changes but allows record mutations for external connections', async () => {
    const db = createDatabaseManager({
      connections: {
        external: {
          dialect: 'sqlite',
          filename: ':memory:',
          schemaManagement: 'external',
          metadataStore: new ModuleCollectionMetadataStore({ documents: [] }),
        },
      },
    });

    try {
      const connection = db.connection();
      expect(connection.schemaManagement).toBe('external');

      const preview = await connection.builder.createCollection(
        'orders',
        (collection) => {
          collection.increments('id');
          collection.string('status');
        },
        { dryRun: true, previewSql: true },
      );
      expect(preview.schemaOperations).toHaveLength(1);

      await expect(
        connection.builder.createCollection('orders', (collection) => {
          collection.increments('id');
          collection.string('status');
        }),
      ).rejects.toBeInstanceOf(SchemaManagementNotAllowedError);
      await expect(
        connection.schema.execute([{ type: 'dropTable', tableName: 'orders' }]),
      ).rejects.toMatchObject({
        code: 'SCHEMA_MANAGEMENT_NOT_ALLOWED',
        connection: 'external',
        operation: 'dropTable',
      });

      const client = await connection.client<any>();
      await client.schema.createTable('orders', (table: any) => {
        table.increments('id');
        table.string('status');
      });
      await connection.query
        .insertInto('orders')
        .values({ status: 'paid' })
        .execute();
      await expect(
        connection.query.selectFrom('orders').select('status').execute(),
      ).resolves.toEqual([{ status: 'paid' }]);
    } finally {
      await db.destroy();
    }
  });

  it('requires an explicit persistent or read-only Metadata Store for external connections', () => {
    const db = createDatabaseManager({
      connections: {
        external: {
          dialect: 'sqlite',
          filename: ':memory:',
          schemaManagement: 'external',
        },
      },
    });

    expect(() => db.connection()).toThrow(
      'requires an explicit Collection Metadata Store',
    );
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
        .insertInto('orderItems')
        .values({ orderNo: 'SO-001' })
        .execute();

      const client = await db.connection().client<any>();
      expect(await client.schema.hasTable('tbl_orderItems')).toBe(true);
      expect(await client.schema.hasColumn('tbl_orderItems', 'orderNo')).toBe(
        true,
      );

      const compiled = db
        .query()
        .selectFrom('orderItems')
        .select('orderNo')
        .compile();
      expect(compiled.sql).toContain('tbl_orderItems');
      expect(compiled.sql).toContain('orderNo');
      expect(compiled.sql).not.toContain('order_no');

      await expect(
        db
          .query()
          .selectFrom('orderItems')
          .select('orderNo')
          .executeTakeFirst(),
      ).resolves.toEqual({ orderNo: 'SO-001' });
    } finally {
      await db.destroy();
    }
  });

  it('uses each connection table prefix without adding a separator', async () => {
    const db = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
          naming: { tablePrefix: 'main' },
        },
        analytics: {
          dialect: 'sqlite',
          filename: ':memory:',
          naming: { tablePrefix: 'analytics_' },
        },
      },
    });

    try {
      await db.builder('main').createCollection('orderItems', (collection) => {
        collection.increments('id');
      });
      await db
        .builder('analytics')
        .createCollection('orderItems', (collection) => {
          collection.increments('id');
        });

      const main = await db.connection('main').client<any>();
      const analytics = await db.connection('analytics').client<any>();
      expect(await main.schema.hasTable('mainorder_items')).toBe(true);
      expect(await analytics.schema.hasTable('analytics_order_items')).toBe(
        true,
      );

      expect(
        db.query('main').selectFrom('orderItems').select('id').compile().sql,
      ).toContain('mainorder_items');
      expect(
        db.query('analytics').selectFrom('orderItems').select('id').compile()
          .sql,
      ).toContain('analytics_order_items');
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

  it('publishes transactional Metadata and Registry invalidation only after commit', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const db = createDatabaseManager({
      metadataStore,
      connections: {
        sqlite: { dialect: 'sqlite', filename: ':memory:' },
      },
    });

    try {
      const connection = db.connection();
      await connection.builder.createCollection('orders', (collection) => {
        collection.increments('id');
      });
      await connection.collections.get('orders');
      const invalidate = vi.spyOn(connection.collections, 'invalidate');

      await expect(
        connection.transaction(async (transaction) => {
          await transaction.builder.addField('orders', {
            name: 'rolledBackStatus',
            type: 'string',
            title: 'Rolled back status',
          });
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect(invalidate).not.toHaveBeenCalled();
      await expect(metadataStore.get('orders')).resolves.toBeUndefined();
      await expect(
        connection.collections.get('orders'),
      ).resolves.not.toMatchObject({
        fields: expect.arrayContaining([
          expect.objectContaining({ name: 'rolledBackStatus' }),
        ]),
      });

      await connection.transaction(async (transaction) => {
        await transaction.query.selectFrom('orders').select('id').execute();
      });
      expect(invalidate).not.toHaveBeenCalled();

      await connection.transaction(async (transaction) => {
        await transaction.builder.addField('orders', {
          name: 'status',
          type: 'string',
          title: 'Status',
        });
      });
      expect(invalidate).toHaveBeenCalledOnce();
      await expect(metadataStore.get('orders')).resolves.toMatchObject({
        document: { fields: { status: { title: 'Status' } } },
      });
      await expect(connection.collections.get('orders')).resolves.toMatchObject(
        {
          fields: expect.arrayContaining([
            expect.objectContaining({ name: 'status', title: 'Status' }),
          ]),
        },
      );
    } finally {
      await db.destroy();
    }
  });

  it('keeps Database Metadata writes in the physical Schema transaction', async () => {
    const state: { connection?: DatabaseConnection } = {};
    const metadataStore = new DatabaseCollectionMetadataStore({
      resolveClient: async () => state.connection!.client(),
    });
    const db = createDatabaseManager({
      metadataStore,
      connections: {
        sqlite: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
    const connection = db.connection();
    state.connection = connection;

    try {
      await expect(
        connection.transaction(async (transaction) => {
          await transaction.builder.createCollection(
            'rolledBackOrders',
            (collection) => {
              collection.title('Rolled back orders');
              collection.increments('id');
            },
          );
          throw new Error('rollback database metadata');
        }),
      ).rejects.toThrow('rollback database metadata');
      const client = await connection.client<any>();
      expect(await client.schema.hasTable('rolled_back_orders')).toBe(false);
      await expect(
        metadataStore.get('rolledBackOrders'),
      ).resolves.toBeUndefined();

      await connection.transaction(async (transaction) => {
        await transaction.builder.createCollection(
          'committedOrders',
          (collection) => {
            collection.title('Committed orders');
            collection.increments('id');
          },
        );
      });
      expect(await client.schema.hasTable('committed_orders')).toBe(true);
      await expect(metadataStore.get('committedOrders')).resolves.toMatchObject(
        { document: { title: 'Committed orders' } },
      );
    } finally {
      await db.destroy();
    }
  });

  it('rejects a non-atomic rename before DDL when supplemental Metadata exists', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const db = createDatabaseManager({
      metadataStore,
      connections: {
        sqlite: { dialect: 'sqlite', filename: ':memory:' },
      },
    });

    try {
      const connection = db.connection();
      await connection.builder.createCollection('orders', (collection) => {
        collection.title('Orders');
        collection.increments('id');
      });

      await expect(
        connection.builder.renameCollection('orders', 'archivedOrders'),
      ).rejects.toBeInstanceOf(CollectionRenameAtomicityError);
      const client = await connection.client<any>();
      expect(await client.schema.hasTable('orders')).toBe(true);
      expect(await client.schema.hasTable('archived_orders')).toBe(false);
      await expect(metadataStore.get('orders')).resolves.toBeDefined();
      await expect(
        metadataStore.get('archivedOrders'),
      ).resolves.toBeUndefined();
    } finally {
      await db.destroy();
    }
  });

  it('renames a deterministically named Collection when no Metadata document exists', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const db = createDatabaseManager({
      metadataStore,
      connections: {
        sqlite: { dialect: 'sqlite', filename: ':memory:' },
      },
    });

    try {
      const connection = db.connection();
      await connection.builder.createCollection('orders', (collection) => {
        collection.increments('id');
      });
      await expect(metadataStore.get('orders')).resolves.toBeUndefined();

      await connection.builder.renameCollection('orders', 'archivedOrders');
      const client = await connection.client<any>();
      expect(await client.schema.hasTable('orders')).toBe(false);
      expect(await client.schema.hasTable('archived_orders')).toBe(true);
      await expect(
        connection.collections.get('archivedOrders'),
      ).resolves.toMatchObject({ name: 'archivedOrders' });
      await expect(
        metadataStore.get('archivedOrders'),
      ).resolves.toBeUndefined();
    } finally {
      await db.destroy();
    }
  });

  it('rejects supplemental writes to a read-only Store before DDL', async () => {
    const db = createDatabaseManager({
      metadataStore: new ModuleCollectionMetadataStore({
        documents: [],
        source: 'src/collection-metadata.ts',
      }),
      connections: {
        sqlite: { dialect: 'sqlite', filename: ':memory:' },
      },
    });

    try {
      const connection = db.connection();
      await expect(
        connection.builder.createCollection('orders', (collection) => {
          collection.title('Orders');
          collection.increments('id');
        }),
      ).rejects.toMatchObject({
        code: 'METADATA_STORE_READ_ONLY',
        operation: 'put',
      });
      const client = await connection.client<any>();
      expect(await client.schema.hasTable('orders')).toBe(false);
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
      'Invalid database dialect "custom". Expected "sqlite", "postgres", "mysql", "oracle", or "mssql".',
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
    const sqlite = resolveKnexConnectionConfig({
      dialect: 'sqlite',
      filename: ':memory:',
      driverOptions: {
        verbose: true,
      },
    });
    expect(sqlite.schemaManagement).toBe('managed');
    expect(sqlite.connection).toEqual({
      filename: ':memory:',
      verbose: true,
    });
    expect(
      resolveKnexConnectionConfig({
        dialect: 'sqlite',
        filename: ':memory:',
        schemaManagement: 'external',
      }).schemaManagement,
    ).toBe('external');

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

    expect(
      resolveKnexConnectionConfig({
        dialect: 'oracle',
        host: '127.0.0.1',
        port: 1521,
        serviceName: 'FREEPDB1',
        username: 'orders_user',
        password: 'secret',
        driverOptions: {
          stmtCacheSize: 0,
        },
      }).connection,
    ).toEqual({
      stmtCacheSize: 0,
      user: 'orders_user',
      password: 'secret',
      connectString: '127.0.0.1:1521/FREEPDB1',
    });

    const mssql = resolveKnexConnectionConfig({
      dialect: 'mssql',
      host: '127.0.0.1',
      port: 1433,
      database: 'orders',
      username: 'sa',
      password: 'secret',
      encrypt: true,
      trustServerCertificate: true,
    });
    expect(mssql).toMatchObject({
      driver: 'tedious',
      knexClient: 'mssql',
    });
    expect(mssql.connection).toEqual({
      server: '127.0.0.1',
      port: 1433,
      database: 'orders',
      user: 'sa',
      password: 'secret',
      encrypt: true,
      options: { trustServerCertificate: true },
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
    expect(resolveDatabaseCapabilities('mssql')).toMatchObject({
      schemas: true,
      views: true,
      replaceView: true,
      materializedViews: false,
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
