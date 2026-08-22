import { defineMigration, type MigrationDefinition } from '@nocobase/database';

const migration: MigrationDefinition = defineMigration({
  name: '202608220001_example_create_messages',

  async up({ builder }) {
    await builder.createCollection('appPluginExampleMessages', (collection) => {
      collection.increments('id');
      collection.string('message', { length: 255, nullable: false });
      collection.datetime('createdAt', { nullable: false });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('appPluginExampleMessages');
  },
});

export default migration;
