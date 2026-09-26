import { defineMigration, type MigrationDefinition } from '@nocobase/db';
const migration: MigrationDefinition = defineMigration({
  name: '202609220001_sales_permissions',
  async up({ builder }) {
    await builder.createCollection('authorizationExampleCarriers', (c) => {
      c.string('id').notNull();
      c.primary('id');
      c.string('title').notNull();
      c.boolean('active').notNull().defaultTo(true);
    });
    await builder.createCollection('authorizationExampleSalesMembers', (c) => {
      c.string('id').notNull();
      c.primary('id');
      c.string('region').notNull();
    });
    await builder.createCollection('authorizationExampleProjects', (c) => {
      c.string('id').notNull();
      c.primary('id');
      c.string('title').notNull();
      c.string('region').notNull();
      c.string('ownerId').notNull();
      c.boolean('confidential').notNull();
      c.string('notes').notNull();
      c.index('region');
      c.index('ownerId');
    });
    await builder.createCollection('authorizationExampleQuotes', (c) => {
      c.string('id').notNull();
      c.primary('id');
      c.string('projectId').notNull();
      c.string('preparedById').notNull();
      c.string('preparedByName').notNull();
      c.string('title').notNull();
      c.string('notes').notNull();
      c.integer('amount').notNull();
      c.string('status').notNull();
      c.index('projectId');
    });
    await builder.createCollection('authorizationExampleOrderChecks', (c) => {
      c.string('id').primary().notNull();
      c.string('orderId').nullable();
      c.string('title').notNull();
      c.boolean('done').notNull().defaultTo(false);
    });
    await builder.createCollection('authorizationExampleOrderCarriers', (c) => {
      c.string('orderId').notNull();
      c.string('carrierId').notNull();
      c.string('note').nullable();
      c.string('internalNote').nullable();
      c.unique(['orderId', 'carrierId']);
    });
    await builder.createCollection('authorizationExampleOrders', (c) => {
      c.string('id').notNull();
      c.primary('id');
      c.string('projectId').notNull();
      c.string('quoteId').notNull();
      c.string('title').notNull();
      c.string('status').notNull();
      c.string('deliveryReference').notNull();
      c.index('projectId');
      c.string('carrierId').nullable();
      c.belongsTo('carrier', 'authorizationExampleCarriers')
        .foreignKey('carrierId')
        .targetKey('id')
        .constraints(false);
      c.hasMany('checks', 'authorizationExampleOrderChecks')
        .foreignKey('orderId')
        .sourceKey('id')
        .constraints(false);
      c.belongsToMany('collaborators', 'authorizationExampleCarriers')
        .through('authorizationExampleOrderCarriers')
        .foreignKey('orderId')
        .otherKey('carrierId')
        .sourceKey('id')
        .targetKey('id')
        .constraints(false);
    });
  },
  async down({ builder }) {
    await builder.dropCollection('authorizationExampleOrders');
    await builder.dropCollection('authorizationExampleOrderCarriers');
    await builder.dropCollection('authorizationExampleOrderChecks');
    await builder.dropCollection('authorizationExampleCarriers');
    await builder.dropCollection('authorizationExampleQuotes');
    await builder.dropCollection('authorizationExampleProjects');
    await builder.dropCollection('authorizationExampleSalesMembers');
  },
});
export default migration;
