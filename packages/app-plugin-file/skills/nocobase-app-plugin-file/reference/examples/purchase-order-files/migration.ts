import {
  defineMigration,
  type MigrationDefinition,
} from '@nocobase/app-database';

const migration: MigrationDefinition = defineMigration({
  name: 'create_purchase_order_files',

  async up({ builder }) {
    await builder.createCollection('purchaseOrders', (table) => {
      table.increments('id').unsigned();
      table.string('number', { length: 64 }).notNull();
      table.datetime('createdAt').notNull();
      table.datetime('updatedAt').notNull();
      table.unique('number', { name: 'uq_purchase_orders_number' });
      table
        .hasMany('attachments', 'purchaseOrderAttachments')
        .foreignKey('orderId');
    });

    await builder.createCollection('purchaseOrderAttachments', (table) => {
      table.string('id', { length: 64 }).notNull();
      table.integer('orderId').unsigned().notNull();
      table.string('disk', { length: 64 }).notNull();
      table.string('key', { length: 512 }).notNull();
      table.string('filename', { length: 255 }).notNull();
      table.string('mimeType', { length: 255 }).notNull();
      table.bigInt('size').unsigned().notNull();
      table.boolean('public').notNull().defaultTo(false);
      table.datetime('createdAt').notNull();
      table.datetime('updatedAt').notNull();
      table.primary('id', { name: 'pk_purchase_order_attachments' });
      table.unique(['disk', 'key'], {
        name: 'uq_purchase_order_attachments_disk_key',
      });
      table.index('orderId', {
        name: 'idx_purchase_order_attachments_order',
      });
      table
        .belongsTo('order', 'purchaseOrders', { index: false })
        .foreignKey('orderId')
        .targetKey('id')
        .constraints(true)
        .onDelete('cascade');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('purchaseOrderAttachments');
    await builder.dropCollection('purchaseOrders');
  },
});

export default migration;
