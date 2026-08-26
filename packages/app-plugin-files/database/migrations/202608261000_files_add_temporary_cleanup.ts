import { defineMigration } from '@nocobase/app-database';

const CLEANUP_INDEX = 'idx_files_temporary_cleanup';

export default defineMigration({
  name: '202608261000_files_add_temporary_cleanup',

  async up({ builder }) {
    await builder.alterCollection('files', (collection) => {
      collection.datetime('temporaryCleanupCompletedAt').nullable();
      collection.index(
        ['status', 'temporaryCleanupCompletedAt', 'uploadExpiresAt'],
        { name: CLEANUP_INDEX },
      );
    });
  },

  async down({ builder }) {
    await builder.dropIndex('files', CLEANUP_INDEX);
    await builder.alterCollection('files', (collection) => {
      collection.dropField('temporaryCleanupCompletedAt');
    });
  },
});
