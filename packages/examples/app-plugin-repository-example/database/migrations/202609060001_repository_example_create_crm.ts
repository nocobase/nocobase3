import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609060001_repository_example_create_crm',
  async up({ builder }) {
    await builder.createCollections([
      {
        name: 'repositoryExampleCustomers',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('name', { length: 120 }).notNull();
          collection.string('company', { length: 160 }).notNull();
          collection.string('email', { length: 255 }).notNull();
          collection
            .enum('status', { values: ['lead', 'active', 'inactive'] })
            .notNull()
            .defaultTo('lead');
          collection
            .hasMany('contacts', 'repositoryExampleContacts')
            .sourceKey('id')
            .foreignKey('customerId')
            .constraints(false);
          collection
            .hasMany('orders', 'repositoryExampleOrders')
            .sourceKey('id')
            .foreignKey('customerId')
            .constraints(false);
        },
      },
      {
        name: 'repositoryExampleContacts',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('name', { length: 120 }).notNull();
          collection.string('email', { length: 255 }).notNull();
          collection.string('phone', { length: 64 }).notNull();
          collection.string('customerId', { length: 64 }).notNull();
          collection
            .belongsTo('customer', 'repositoryExampleCustomers')
            .targetKey('id')
            .foreignKey('customerId')
            .constraints(true)
            .onDelete('cascade');
        },
      },
      {
        name: 'repositoryExampleProducts',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('name', { length: 120 }).notNull();
          collection.string('sku', { length: 64 }).notNull();
          collection.integer('unitPriceCents').notNull();
          collection.unique(['sku']);
          collection
            .hasMany('items', 'repositoryExampleOrderItems')
            .sourceKey('id')
            .foreignKey('productId')
            .constraints(false);
        },
      },
      {
        name: 'repositoryExampleOrders',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('number', { length: 64 }).notNull();
          collection
            .enum('status', {
              values: ['draft', 'confirmed', 'paid', 'cancelled'],
            })
            .notNull()
            .defaultTo('draft');
          collection.integer('version').notNull();
          collection.optimisticLock('version');
          collection.string('customerId', { length: 64 }).notNull();
          collection
            .belongsTo('customer', 'repositoryExampleCustomers')
            .targetKey('id')
            .foreignKey('customerId')
            .constraints(true)
            .onDelete('restrict');
          collection
            .hasMany('items', 'repositoryExampleOrderItems')
            .sourceKey('id')
            .foreignKey('orderId')
            .constraints(false);
          collection.unique(['number']);
        },
      },
      {
        name: 'repositoryExampleOrderItems',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('orderId', { length: 64 }).notNull();
          collection.string('productId', { length: 64 }).notNull();
          collection.integer('quantity').notNull();
          collection.integer('unitPriceCents').notNull();
          collection
            .belongsTo('order', 'repositoryExampleOrders')
            .targetKey('id')
            .foreignKey('orderId')
            .constraints(true)
            .onDelete('cascade');
          collection
            .belongsTo('product', 'repositoryExampleProducts')
            .targetKey('id')
            .foreignKey('productId')
            .constraints(true)
            .onDelete('restrict');
        },
      },
    ]);
  },
  async down({ builder }) {
    await builder.dropCollection('repositoryExampleOrderItems');
    await builder.dropCollection('repositoryExampleOrders');
    await builder.dropCollection('repositoryExampleProducts');
    await builder.dropCollection('repositoryExampleContacts');
    await builder.dropCollection('repositoryExampleCustomers');
  },
});
export default migration;
