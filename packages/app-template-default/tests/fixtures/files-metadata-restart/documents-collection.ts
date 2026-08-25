import type { CollectionDefinitionBuilder } from '@nocobase/app-database';

export function defineRestartDocumentsCollection(
  collection: CollectionDefinitionBuilder,
): void {
  collection.string('id', { length: 64 }).notNull().primary();
  collection.string('fileId', { length: 64 }).nullable();
  collection.foreignKey('fileId', {
    references: { collection: 'files', fields: ['id'] },
    onDelete: 'restrict',
  });
}

export function defineRestartDocumentFilesCollection(
  collection: CollectionDefinitionBuilder,
): void {
  collection.string('id', { length: 64 }).notNull().primary();
  collection.string('restartDocumentId', { length: 64 }).notNull();
  collection.string('fileId', { length: 64 }).notNull();
  collection.integer('slot').notNull();
  collection.datetime('reservationExpiresAt').nullable();
  collection.datetime('createdAt').notNull();
  collection.datetime('updatedAt').notNull();
  collection.unique(['restartDocumentId', 'slot']);
  collection.unique(['restartDocumentId', 'fileId']);
  collection.foreignKey('restartDocumentId', {
    references: { collection: 'restartDocuments', fields: ['id'] },
    onDelete: 'cascade',
  });
  collection.foreignKey('fileId', {
    references: { collection: 'files', fields: ['id'] },
    onDelete: 'restrict',
  });
}
