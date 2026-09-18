import { defineMigration, type MigrationDefinition } from '@nocobase/db';
const migration: MigrationDefinition = defineMigration({
  name: '202609220001_sales_permissions',
  async up({ builder }) {
    await builder.createCollection('authorizationExampleTeams', (c) => {
      c.string('id').notNull();
      c.primary('id');
      c.string('title').notNull();
      c.boolean('active').notNull().defaultTo(true);
    });
    await builder.createCollection('authorizationExampleTeamMembers', (c) => {
      c.string('id').notNull();
      c.primary('id');
      c.string('teamId').notNull();
      c.string('userId').notNull();
      c.index('userId');
      c.unique(['teamId', 'userId']);
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
    await builder.createCollection('authorizationExampleOrders', (c) => {
      c.string('id').notNull();
      c.primary('id');
      c.string('projectId').notNull();
      c.string('quoteId').notNull();
      c.string('title').notNull();
      c.string('status').notNull();
      c.string('deliveryReference').notNull();
      c.index('projectId');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('authorizationExampleTeamMembers');
    await builder.dropCollection('authorizationExampleTeams');
    await builder.dropCollection('authorizationExampleOrders');
    await builder.dropCollection('authorizationExampleQuotes');
    await builder.dropCollection('authorizationExampleProjects');
    await builder.dropCollection('authorizationExampleSalesMembers');
  },
});
export default migration;
