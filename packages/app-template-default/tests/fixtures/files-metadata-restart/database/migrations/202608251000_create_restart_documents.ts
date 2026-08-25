import { defineMigration } from '@nocobase/database';

import {
  defineRestartDocumentFilesCollection,
  defineRestartDocumentsCollection,
} from '../../documents-collection.js';

export default defineMigration({
  name: '202608251000_create_restart_documents',

  async up({ builder }) {
    await builder.createCollection(
      'restartDocuments',
      defineRestartDocumentsCollection,
    );
    await builder.createCollection(
      'restartDocumentFiles',
      defineRestartDocumentFilesCollection,
    );
  },

  async restoreMetadata({ builder }) {
    await builder.registerCollectionMetadata(
      'restartDocuments',
      defineRestartDocumentsCollection,
    );
    await builder.registerCollectionMetadata(
      'restartDocumentFiles',
      defineRestartDocumentFilesCollection,
    );
  },

  async down({ builder }) {
    await builder.dropCollection('restartDocumentFiles');
    await builder.dropCollection('restartDocuments');
  },
});
