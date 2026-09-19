import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609160004_hub_app_ownership',
  async up({ builder }) {
    await builder.alterCollection('hubApps', (collection) => {
      // Existing Apps have no reliable creator record and remain administrator-only.
      collection.string('createdBy', { length: 128 });
      collection.index(['createdBy', 'createdAt'], {
        name: 'hub_apps_creator_created_at',
      });
    });
  },
  async down({ builder }) {
    await builder.dropIndex('hubApps', 'hub_apps_creator_created_at');
    await builder.dropField('hubApps', 'createdBy');
  },
});
export default migration;
