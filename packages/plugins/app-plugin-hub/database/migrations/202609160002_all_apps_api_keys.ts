import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609160002_all_apps_api_keys',
  irreversible: true,
  async up({ builder }) {
    await builder.alterCollection('hubApiKeys', (c) => {
      c.boolean('allApps').notNull().defaultTo(false);
    });
  },
});
export default migration;
