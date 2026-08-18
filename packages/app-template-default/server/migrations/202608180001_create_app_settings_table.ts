import { defineMigration } from '@nocobase/database';
import type { CollectionDefinitionBuilder, MigrationContext, MigrationDefinition } from '@nocobase/database';

const migration: MigrationDefinition = defineMigration({
  name: '202608180001_create_app_settings_table',

  async up({ builder }: MigrationContext): Promise<void> {
    await builder.createCollection('appSettings', (collection: CollectionDefinitionBuilder) => {
      collection.increments('id');
      collection.string('key', { length: 191, nullable: false, unique: true });
      collection.text('value', { nullable: true });
      collection.datetime('createdAt', { nullable: true });
      collection.datetime('updatedAt', { nullable: true });
    });
  },

  async down({ builder }: MigrationContext): Promise<void> {
    await builder.dropCollection('appSettings');
  },
});

export default migration;
