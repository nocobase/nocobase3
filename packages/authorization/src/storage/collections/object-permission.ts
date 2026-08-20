import type { CollectionBuilder } from '@nocobase/database';

/** Stores action and field permissions for one resource. */
export function createObjectPermissionCollection(builder: CollectionBuilder) {
  return builder.createCollection('authzObjectPermissions', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('permissionSetId', { length: 64 }).notNull();
    collection.string('resource', { length: 255 }).notNull();
    collection.json('actions').notNull();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();

    collection.belongsTo('permissionSet', 'authzPermissionSets', { index: false })
      .foreignKey('permissionSetId').constraints(false);
    collection.primary('id', { name: 'pk_authz_object_permissions' });
    collection.unique(['permissionSetId', 'resource'], { name: 'uq_authz_object_permissions_set_resource' });
    collection.index('resource', { name: 'idx_authz_object_permissions_resource' });
  });
}
