import type { CollectionDefinitionBuilder } from '@nocobase/database';

export function defineFilesCollection(
  collection: CollectionDefinitionBuilder,
): void {
  collection.string('id', { length: 64 }).notNull();
  collection.string('status', { length: 16 }).notNull();
  collection.string('storageKey', { length: 512 }).nullable();
  collection.string('name', { length: 255 }).notNull();
  collection.bigInt('size').nullable();
  collection.string('contentType', { length: 255 }).nullable();
  collection.datetime('uploadExpiresAt').notNull();
  collection.string('publicTokenHash', { length: 512 }).nullable();
  collection.string('publicDisposition', { length: 16 }).nullable();
  collection.datetime('createdAt').notNull();
  collection.datetime('updatedAt').notNull();

  collection.primary('id', { name: 'pk_files' });
  collection.unique('storageKey', { name: 'uq_files_storage_key' });
  collection.index(['status', 'uploadExpiresAt'], {
    name: 'idx_files_status_upload_expires_at',
  });
}
