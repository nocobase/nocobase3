import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609020002_create_orders',

  async up({ builder }) {
    await builder.createCollection('orders', (collection) => {
      collection.title('Orders');
      collection.description(
        'Commerce orders linked to customers in the external CRM.',
      );
      collection.increments('id');
      collection
        .string('orderNo', { length: 64 })
        .notNull()
        .unique()
        .title('Order number');
      collection
        .integer('externalCustomerId')
        .notNull()
        .title('External CRM customer ID');
      collection
        .string('customerNameSnapshot', { length: 128 })
        .notNull()
        .title('Customer name snapshot');
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('draft')
        .title('Status');
      collection
        .decimal('totalAmount', { precision: 12, scale: 2 })
        .notNull()
        .defaultTo(0)
        .title('Total amount');
      collection.datetime('createdAt').notNull().title('Created at');
    });

    await builder.createCollection('orderItems', (collection) => {
      collection.title('Order items');
      collection.increments('id');
      collection.integer('orderId').notNull();
      collection.integer('productId').notNull();
      collection.integer('quantity').notNull();
      collection
        .decimal('unitPrice', { precision: 12, scale: 2 })
        .notNull()
        .title('Unit price');
      collection
        .decimal('subtotal', { precision: 12, scale: 2 })
        .notNull()
        .title('Subtotal');
      collection
        .belongsTo('order', 'orders')
        .foreignKey('orderId')
        .targetKey('id')
        .constraints(true)
        .onDelete('cascade');
      collection
        .belongsTo('product', 'products')
        .foreignKey('productId')
        .targetKey('id')
        .constraints(true);
    });

    await builder.alterCollection('orders', (collection) => {
      collection
        .hasMany('items', 'orderItems')
        .sourceKey('id')
        .foreignKey('orderId')
        .title('Items');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('orderItems');
    await builder.dropCollection('orders');
  },
});

export default migration;
