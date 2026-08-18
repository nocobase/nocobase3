import type { CollectionBuilder } from '@nocobase/database';

/** Stores Better Auth sessions and their expiration details. */
export function createSessionCollection(builder: CollectionBuilder) {
  return builder.createCollection('session', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.datetime('expiresAt').notNull();
    collection.string('token', { length: 255 }).notNull();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.string('ipAddress', { length: 128 }).nullable();
    collection.text('userAgent').nullable();
    collection.string('userId', { length: 64 }).notNull();

    collection.belongsTo('user', 'user', { index: false })
      .foreignKey('userId')
      .constraints(false);

    collection.primary('id', { name: 'pk_session' });
    collection.unique('token', { name: 'uq_session_token' });
    collection.index('userId', { name: 'idx_session_user' });
    collection.index('expiresAt', { name: 'idx_session_expires_at' });
  });
}
