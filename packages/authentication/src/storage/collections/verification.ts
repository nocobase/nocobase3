import type { CollectionBuilder } from '@nocobase/database';

/** Stores Better Auth verification values and expiration details. */
export function createVerificationCollection(builder: CollectionBuilder) {
  return builder.createCollection('verification', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('identifier', { length: 320 }).notNull();
    collection.text('value').notNull();
    collection.datetime('expiresAt').notNull();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();

    collection.primary('id', { name: 'pk_verification' });
    collection.index('identifier', { name: 'idx_verification_identifier' });
    collection.index('expiresAt', { name: 'idx_verification_expires_at' });
  });
}
