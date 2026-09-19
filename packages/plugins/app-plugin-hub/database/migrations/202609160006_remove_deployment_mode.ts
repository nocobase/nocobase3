import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/** Publishing is controlled by the caller's command, not an App-level policy. */
const migration: MigrationDefinition = defineMigration({
  name: '202609160006_remove_deployment_mode',
  async up({ builder }) {
    await builder.dropField('hubApps', 'deploymentMode');
  },
  async down({ builder }) {
    await builder.alterCollection('hubApps', (collection) => {
      collection
        .string('deploymentMode', { length: 16 })
        .notNull()
        .defaultTo('manual');
    });
  },
});
export default migration;
