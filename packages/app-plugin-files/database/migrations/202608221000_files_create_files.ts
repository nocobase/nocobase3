import { defineMigration } from '@nocobase/app-database';

import { defineFilesCollection } from '../files-collection.js';

export default defineMigration({
  name: '202608221000_files_create_files',

  async up({ builder }) {
    await builder.createCollection('files', defineFilesCollection);
  },

  async restoreMetadata({ builder }) {
    await builder.registerCollectionMetadata('files', defineFilesCollection);
  },

  async down({ builder }) {
    await builder.dropCollection('files');
  },
});
