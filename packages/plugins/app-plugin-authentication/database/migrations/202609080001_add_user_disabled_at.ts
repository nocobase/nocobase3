import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609080001_add_user_disabled_at',

  async up({ builder }) {
    await builder.alterCollection('user', (collection) => {
      collection.datetime('disabledAt').nullable();
    });
  },

  async down({ builder }) {
    await builder.alterCollection('user', (collection) => {
      collection.dropField('disabledAt');
    });
  },
});

export default migration;
