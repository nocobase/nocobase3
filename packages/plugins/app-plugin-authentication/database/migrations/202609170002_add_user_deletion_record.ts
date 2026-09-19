import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609170002_add_user_deletion_record',
  async up({ builder }) {
    await builder.alterCollection('user', (collection) => {
      collection.datetime('deletedAt').nullable();
      collection.string('deletedBy', { length: 64 }).nullable();
    });
  },
  async down({ builder }) {
    await builder.alterCollection('user', (collection) => {
      collection.dropField('deletedBy');
      collection.dropField('deletedAt');
    });
  },
});
export default migration;
