import type { BuilderResult, CollectionBuilder } from '@nocobase/database';

/** Links a Permission Set Group to its Permission Sets. */
export function createPermissionSetGroupItemCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection(
    'authzPermissionSetGroupItems',
    (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('permissionSetGroupId', { length: 64 }).notNull();
      collection.string('permissionSetId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();

      collection
        .belongsTo('permissionSetGroup', 'authzPermissionSetGroups', {
          index: false,
        })
        .foreignKey('permissionSetGroupId')
        .constraints(false);
      collection
        .belongsTo('permissionSet', 'authzPermissionSets', { index: false })
        .foreignKey('permissionSetId')
        .constraints(false);
      collection.primary('id', { name: 'pk_authz_permission_set_group_items' });
      collection.unique(['permissionSetGroupId', 'permissionSetId'], {
        name: 'uq_authz_permission_set_group_items_pair',
      });
      collection.index('permissionSetId', {
        name: 'idx_authz_permission_set_group_items_set',
      });
    },
  );
}
