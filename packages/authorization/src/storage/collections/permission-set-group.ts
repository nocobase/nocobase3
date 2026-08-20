import type { CollectionBuilder } from '@nocobase/database';

/** Stores work responsibilities composed from multiple Permission Sets. */
export function createPermissionSetGroupCollection(builder: CollectionBuilder) {
  return builder.createCollection('authzPermissionSetGroups', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('key', { length: 255 }).notNull();
    collection.string('title', { length: 255 }).notNull();
    collection.text('description').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();

    collection.hasMany('items', 'authzPermissionSetGroupItems').foreignKey('permissionSetGroupId');
    collection.primary('id', { name: 'pk_authz_permission_set_groups' });
    collection.unique('key', { name: 'uq_authz_permission_set_groups_key' });
  });
}
