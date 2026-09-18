import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609170001_add_deployment_events',
  async up({ builder }): Promise<void> {
    await builder.alterCollection('hubAppDeployments', (collection) => {
      collection.json('events').nullable();
    });
  },
  async down({ builder }): Promise<void> {
    await builder.alterCollection('hubAppDeployments', (collection) => {
      collection.dropField('events');
    });
  },
});
export default migration;
