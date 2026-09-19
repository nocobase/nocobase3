import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609020001_create_commerce_collections',

  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.title('Customers');
      collection.description('Customers that can place orders.');
      collection.increments('id');
      collection
        .string('email', { length: 255 })
        .notNull()
        .unique()
        .title('Email address');
      collection
        .string('displayName', { length: 128 })
        .notNull()
        .title('Display name');
    });

    await builder.createCollection('orderStatuses', (collection) => {
      collection.title('Order statuses');
      collection.increments('id');
      collection.string('code', { length: 32 }).notNull().unique();
      collection
        .string('title', { length: 128 })
        .notNull()
        .title('Status label');
    });

    await builder.createCollection('orders', (collection) => {
      collection.title('Orders');
      collection.description('Customer purchase orders.');
      collection.increments('id');
      collection.integer('customerId').notNull();
      collection.string('statusCode', { length: 32 }).notNull();
      collection
        .string('orderNo', { length: 64 })
        .notNull()
        .unique()
        .title('Order number');
      collection
        .decimal('totalAmount', { precision: 12, scale: 2 })
        .notNull()
        .defaultTo(0)
        .title('Total amount');
      collection
        .belongsTo('customer', 'customers')
        .foreignKey('customerId')
        .targetKey('id')
        .constraints(true)
        .title('Customer');
      collection
        .belongsTo('status', 'orderStatuses')
        .foreignKey('statusCode')
        .targetKey('code')
        .constraints(true)
        .title('Status');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('orders');
    await builder.dropCollection('orderStatuses');
    await builder.dropCollection('customers');
  },
});

export default migration;
