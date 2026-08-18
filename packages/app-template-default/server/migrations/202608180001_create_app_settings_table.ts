import { defineMigration } from '@nocobase/database';

export default defineMigration({
  name: '202608180001_create_app_settings_table',

  async up({ builder }) {
    await builder.createCollection('appSettings', (collection) => {
      collection.increments('id');
      collection.string('key', { length: 191, nullable: false, unique: true });
      collection.text('value', { nullable: true });
      collection.datetime('createdAt', { nullable: true });
      collection.datetime('updatedAt', { nullable: true });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('appSettings');
  },
});
