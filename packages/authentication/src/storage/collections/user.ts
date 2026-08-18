import type { CollectionBuilder } from '@nocobase/database';

/** Stores Better Auth user profiles. */
export function createUserCollection(builder: CollectionBuilder) {
  return builder.createCollection('user', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('name', { length: 255 }).notNull();
    collection.string('email', { length: 320 }).notNull();
    collection.boolean('emailVerified').notNull().defaultTo(false);
    collection.text('image').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();

    collection.hasMany('sessions', 'session').foreignKey('userId');
    collection.hasMany('accounts', 'account').foreignKey('userId');

    collection.primary('id', { name: 'pk_user' });
    collection.unique('email', { name: 'uq_user_email' });
  });
}
