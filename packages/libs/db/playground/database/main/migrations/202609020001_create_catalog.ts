import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609020001_create_catalog',

  async up({ builder }) {
    await builder.createCollection('products', (collection) => {
      collection.title('Products');
      collection.description('Products available to order.');
      collection.increments('id');
      collection.string('name', { length: 128 }).notNull().title('Name');
      collection.string('sku', { length: 64 }).notNull().unique().title('SKU');
      collection
        .decimal('price', { precision: 12, scale: 2 })
        .notNull()
        .title('Unit price');
      collection.integer('stock').notNull().defaultTo(0).title('Stock');
      collection.datetime('createdAt').notNull().title('Created at');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('products');
  },
});

export default migration;
