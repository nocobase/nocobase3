import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202608220001_database_example_create_messages',

  async up({ builder }) {
    await builder.createCollection(
      'appPluginDatabaseExampleMessages',
      (collection) => {
        collection.increments('id');
        collection.string('message', { length: 255, nullable: false });
        collection.datetime('createdAt', { nullable: false });
      },
    );
  },

  async down({ builder }) {
    await builder.dropCollection('appPluginDatabaseExampleMessages');
  },
});

export default migration;
