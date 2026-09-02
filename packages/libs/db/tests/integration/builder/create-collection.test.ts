import { expect, it } from 'vitest';
import {
  describeIntegrationDatabases,
  getColumnType,
  listForeignKeys,
  listIndexes,
} from '../helpers.js';

describeIntegrationDatabases('collection creation', (context) => {
  it('checks collection existence by logical name', async () => {
    await expect(context.builder.hasCollection('customers')).resolves.toBe(
      false,
    );

    await context.builder.createCollection('customers', (collection) => {
      collection.increments('id');
    });

    await expect(context.builder.hasCollection('customers')).resolves.toBe(
      true,
    );
    await context.builder.dropCollection('customers');
    await expect(context.builder.hasCollection('customers')).resolves.toBe(
      false,
    );
  });

  it('creates related collections with indexes and foreign keys', async () => {
    await context.builder.createCollection('customers', {
      fields: [
        { name: 'id', type: 'increments', primaryKey: true },
        { name: 'email', type: 'string', nullable: false, unique: true },
      ],
    });

    await context.builder.createCollection('orders', (collection) => {
      collection.increments('id');
      collection
        .belongsTo('customer', 'customers')
        .foreignKey('customerId')
        .foreignKeyType('integer')
        .unsigned()
        .constraints(true)
        .index();
      collection
        .decimal('amount', { precision: 12, scale: 2 })
        .notNull()
        .defaultTo(0);
      collection.string('status', { length: 32 }).defaultTo('draft');
      collection.index(['status']);
    });

    expect(await context.db.schema.hasTable(context.table('customers'))).toBe(
      true,
    );
    expect(await context.db.schema.hasTable(context.table('orders'))).toBe(
      true,
    );
    expect(
      await context.db.schema.hasColumn(context.table('orders'), 'customer_id'),
    ).toBe(true);
    expect(
      await context.db.schema.hasColumn(context.table('orders'), 'amount'),
    ).toBe(true);

    const orderIndexNames = (
      await listIndexes(context, context.table('orders'))
    ).map((row) => row.name);
    expect(orderIndexNames).toContain(
      context.indexName('orders', ['customer_id']),
    );
    expect(orderIndexNames).toContain(context.indexName('orders', ['status']));

    const foreignKeys = await listForeignKeys(context, context.table('orders'));
    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: context.table('customers'),
          from: 'customer_id',
          to: 'id',
        }),
      ]),
    );

    await context
      .db(context.table('customers'))
      .insert({ email: 'a@example.com' });
    await context
      .db(context.table('orders'))
      .insert({ customer_id: 1, amount: 12.5, status: 'paid' });

    await expect(
      context
        .db(context.table('orders'))
        .select('customer_id', 'amount', 'status'),
    ).resolves.toEqual([
      expect.objectContaining({
        customer_id: 1,
        status: 'paid',
      }),
    ]);
  });

  it('creates scalar fields with defaults, native types, and deterministic database column names', async () => {
    const auditLogsTable = context.table('auditLogs');

    await context.builder.createCollection('auditLogs', (collection) => {
      collection.increments('id');
      collection.string('eventName', { length: 128 }).notNull();
      collection.boolean('enabled').defaultTo(true);
      collection.json('payload');
      collection.native(
        'ipAddress',
        context.spec.dialect === 'oracle' ? 'clob' : 'text',
        {
          title: 'IP address',
        },
      );
    });

    expect(await context.db.schema.hasTable(auditLogsTable)).toBe(true);
    expect(
      await context.db.schema.hasColumn(auditLogsTable, 'event_name'),
    ).toBe(true);
    expect(
      await context.db.schema.hasColumn(auditLogsTable, 'ip_address'),
    ).toBe(true);

    await context.db(auditLogsTable).insert({
      event_name: 'login',
      payload: JSON.stringify({ userId: 1 }),
      ip_address: '127.0.0.1',
    });

    await expect(
      context.db(auditLogsTable).select('event_name', 'enabled', 'ip_address'),
    ).resolves.toEqual([
      expect.objectContaining({
        event_name: 'login',
        enabled: expect.anything(),
        ip_address: '127.0.0.1',
      }),
    ]);

    expect(
      await getColumnType(context, auditLogsTable, 'ip_address'),
    ).toContain(context.spec.dialect === 'oracle' ? 'clob' : 'text');
  });

  it('skips duplicate create and missing drop when idempotent options are enabled', async () => {
    await context.builder.createCollection(
      'appSettings',
      (collection) => {
        collection.increments('id');
        collection.string('key', {
          length: 191,
          nullable: false,
          unique: true,
        });
      },
      { ifNotExists: true },
    );

    await expect(
      context.builder.createCollection(
        'appSettings',
        (collection) => {
          collection.increments('id');
          collection.string('key', {
            length: 191,
            nullable: false,
            unique: true,
          });
        },
        { ifNotExists: true },
      ),
    ).resolves.toBeDefined();
    expect(await context.db.schema.hasTable(context.table('appSettings'))).toBe(
      true,
    );

    await expect(
      context.builder.dropCollection('appSettings', { ifExists: true }),
    ).resolves.toBeDefined();
    expect(await context.db.schema.hasTable(context.table('appSettings'))).toBe(
      false,
    );
    await expect(
      context.builder.dropCollection('appSettings', { ifExists: true }),
    ).resolves.toBeDefined();
  });
});
