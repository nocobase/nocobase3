import type { CollectionBuilder } from '@nocobase/database';

/** Stores reusable object, action, and field capabilities. */
export function createPermissionSetCollection(builder: CollectionBuilder) {
  return builder.createCollection('authzPermissionSets', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('key', { length: 255 }).notNull();
    collection.string('title', { length: 255 }).notNull();
    collection.text('description').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();

    collection.hasMany('objectPermissions', 'authzObjectPermissions').foreignKey('permissionSetId');
    collection.hasMany('groupItems', 'authzPermissionSetGroupItems').foreignKey('permissionSetId');
    collection.primary('id', { name: 'pk_authz_permission_sets' });
    collection.unique('key', { name: 'uq_authz_permission_sets_key' });
  });
}
