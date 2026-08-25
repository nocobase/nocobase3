import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/app-database';

const migration: MigrationDefinition = defineMigration({
  name: '202608240001_create_orders_tables',

  async up({ builder }: MigrationContext): Promise<void> {
    await builder.createCollection('app_orders_meta', (collection) => {
      collection.string('key', { length: 64 }).notNull();
      collection.integer('value').notNull();
      collection.primary('key', { name: 'pk_orders_meta' });
    });

    await builder.createCollection('app_orders_customers', (collection) => {
      collection.string('id', { length: 32 }).notNull();
      collection.string('name', { length: 160 }).notNull();
      collection.string('contactName', { length: 120 }).nullable();
      collection.string('phone', { length: 64 }).nullable();
      collection.string('email', { length: 320 }).nullable();
      collection.string('level', { length: 32 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_orders_customers' });
      collection.unique('name', { name: 'uq_orders_customers_name' });
    });

    await builder.createCollection('app_orders_products', (collection) => {
      collection.string('id', { length: 32 }).notNull();
      collection.string('sku', { length: 64 }).notNull();
      collection.string('name', { length: 160 }).notNull();
      collection.string('category', { length: 120 }).nullable();
      collection.decimal('price', { precision: 18, scale: 2 }).notNull();
      collection.integer('stock').notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_orders_products' });
      collection.unique('sku', { name: 'uq_orders_products_sku' });
    });

    await builder.createCollection('app_orders_orders', (collection) => {
      collection.string('id', { length: 32 }).notNull();
      collection.string('orderNo', { length: 64 }).notNull();
      collection.string('customerId', { length: 32 }).notNull();
      collection.string('customerName', { length: 160 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.string('paymentStatus', { length: 32 }).notNull();
      collection.decimal('totalAmount', { precision: 18, scale: 2 }).notNull();
      collection.text('notes').nullable();
      collection.datetime('placedAt').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_orders_orders' });
      collection.unique('orderNo', { name: 'uq_orders_orders_no' });
      collection.index('customerId', { name: 'idx_orders_orders_customer' });
      collection.index('status', { name: 'idx_orders_orders_status' });
    });

    await builder.createCollection('app_orders_order_lines', (collection) => {
      collection.increments('id');
      collection.string('orderId', { length: 32 }).notNull();
      collection.string('productId', { length: 32 }).notNull();
      collection.string('productName', { length: 160 }).notNull();
      collection.integer('quantity').notNull();
      collection.decimal('unitPrice', { precision: 18, scale: 2 }).notNull();
      collection.decimal('subtotal', { precision: 18, scale: 2 }).notNull();
      collection.index('orderId', { name: 'idx_orders_lines_order' });
      collection.unique(['orderId', 'productId'], {
        name: 'uq_orders_lines_order_product',
      });
    });
  },

  async down({ builder }: MigrationContext): Promise<void> {
    await builder.dropCollection('app_orders_order_lines');
    await builder.dropCollection('app_orders_orders');
    await builder.dropCollection('app_orders_products');
    await builder.dropCollection('app_orders_customers');
    await builder.dropCollection('app_orders_meta');
  },
});

export default migration;
