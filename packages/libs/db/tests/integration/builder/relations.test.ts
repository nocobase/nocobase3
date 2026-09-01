import { expect, it } from 'vitest';
import {
  describeIntegrationDatabases,
  expectForeignKeyViolation,
  listForeignKeys,
  listIndexes,
} from '../helpers.js';

describeIntegrationDatabases('relation fields', (context) => {
  it('enforces belongsTo foreign key constraints when requested', async () => {
    await context.builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('email').unique();
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
    });

    await context
      .db(context.table('customers'))
      .insert({ email: 'a@example.com' });
    await context.db(context.table('orders')).insert({ customer_id: 1 });
    await expectForeignKeyViolation(
      context.db(context.table('orders')).insert({ customer_id: 999 }),
    );

    expect(await listForeignKeys(context, context.table('orders'))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: context.table('customers'),
          from: 'customer_id',
          to: 'id',
        }),
      ]),
    );
    expect(
      (await listIndexes(context, context.table('orders'))).map(
        (index) => index.name,
      ),
    ).toContain(context.indexName('orders', ['customer_id']));
  });

  it('keeps inverse relations as metadata without creating local columns', async () => {
    await context.builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.hasOne('profile', 'profiles').foreignKey('customerId');
      collection.hasMany('orders', 'orders').foreignKey('customerId');
      collection
        .belongsToMany('products', 'products')
        .through('orderProducts')
        .foreignKey('customerId')
        .otherKey('productId');
    });

    expect(
      await context.db.schema.hasColumn(context.table('customers'), 'profile'),
    ).toBe(false);
    expect(
      await context.db.schema.hasColumn(context.table('customers'), 'orders'),
    ).toBe(false);
    expect(
      await context.db.schema.hasColumn(context.table('customers'), 'products'),
    ).toBe(false);

    const metadata = await context.metadataStore.getCollection('customers');
    expect(metadata?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'profile', type: 'hasOne' }),
        expect.objectContaining({ name: 'orders', type: 'hasMany' }),
        expect.objectContaining({ name: 'products', type: 'belongsToMany' }),
      ]),
    );
  });

  it('uses deterministic physical columns for logical relation keys during alteration', async () => {
    const usersTable = context.table('users');

    await context.builder.createCollection('users', (collection) => {
      collection.integer('userId');
      collection.primary('userId');
    });
    await context.builder.createCollection('orders', (collection) => {
      collection.increments('id');
    });

    await context.builder.alterCollection('orders', (collection) => {
      collection.integer('createdById');
      collection
        .belongsTo('createdBy', 'users')
        .foreignKey('createdById')
        .targetKey('userId')
        .constraints(true);
    });

    expect(
      await context.db.schema.hasColumn(
        context.table('orders'),
        'created_by_id',
      ),
    ).toBe(true);
    expect(await listForeignKeys(context, context.table('orders'))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: usersTable,
          from: 'created_by_id',
          to: 'user_id',
        }),
      ]),
    );

    await context.db(usersTable).insert({ user_id: 1 });
    await context.db(context.table('orders')).insert({ created_by_id: 1 });
    await expectForeignKeyViolation(
      context.db(context.table('orders')).insert({ created_by_id: 999 }),
    );
  });
});
