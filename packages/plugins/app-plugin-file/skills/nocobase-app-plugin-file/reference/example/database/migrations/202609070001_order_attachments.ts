import { defineMigration } from '@nocobase/db';

// For an existing parent collection, create only the attachment collection and
// add its inverse relation. Match orderId to the parent's actual ID type.
export default defineMigration({
  name: '202609070001_order_attachments',
  async up({ builder }) {
    await builder.createCollection('purchaseOrders', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('number', { length: 64 }).notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.primary('id', { name: 'pk_purchase_orders' });
    });
    await builder.createCollection('purchaseOrderAttachments', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('orderId', { length: 64 }).notNull();
      collection.string('disk', { length: 64 }).notNull();
      collection.string('key', { length: 512 }).notNull();
      collection.string('filename', { length: 255 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').unsigned().notNull();
      collection.boolean('public').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_purchase_order_attachments' });
      collection.unique(['disk', 'key'], { name: 'uq_order_attachment_key' });
      collection.index('orderId', { name: 'idx_order_attachments_owner' });
      collection
        .belongsTo('order', 'purchaseOrders', { index: false })
        .foreignKey('orderId')
        .targetKey('id')
        .constraints(true)
        .onDelete('restrict');
    });
    await builder.alterCollection('purchaseOrders', (collection) => {
      collection
        .hasMany('attachments', 'purchaseOrderAttachments')
        .sourceKey('id')
        .foreignKey('orderId');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('purchaseOrderAttachments');
    await builder.dropCollection('purchaseOrders');
  },
});
