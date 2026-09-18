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
    await builder.createCollection('authorizationExampleOrderChecks', (c) => {
      c.string('id').primary().notNull();
      c.string('orderId').nullable();
      c.string('title').notNull();
      c.boolean('done').notNull().defaultTo(false);
    });
    await builder.createCollection('authorizationExampleOrderTeams', (c) => {
      c.string('orderId').notNull();
      c.string('teamId').notNull();
      c.string('note').nullable();
      c.string('internalNote').nullable();
      c.unique(['orderId', 'teamId']);
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
      c.string('deliveryTeamId').nullable();
      c.belongsTo('deliveryTeam', 'authorizationExampleTeams')
        .foreignKey('deliveryTeamId')
        .targetKey('id')
        .constraints(false);
      c.hasMany('checks', 'authorizationExampleOrderChecks')
        .foreignKey('orderId')
        .sourceKey('id')
        .constraints(false);
      c.belongsToMany('collaborators', 'authorizationExampleTeams')
        .through('authorizationExampleOrderTeams')
        .foreignKey('orderId')
        .otherKey('teamId')
        .sourceKey('id')
        .targetKey('id')
        .constraints(false);
    });
  },
  async down({ builder }) {
    await builder.dropCollection('authorizationExampleOrders');
    await builder.dropCollection('authorizationExampleOrderTeams');
    await builder.dropCollection('authorizationExampleOrderChecks');
    await builder.dropCollection('authorizationExampleTeamMembers');
    await builder.dropCollection('authorizationExampleTeams');
    await builder.dropCollection('authorizationExampleQuotes');
    await builder.dropCollection('authorizationExampleProjects');
    await builder.dropCollection('authorizationExampleSalesMembers');
  },
});
export default migration;
