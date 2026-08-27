import type {
  BuilderResult,
  CollectionBuilder,
  CollectionDefinitionBuilder,
} from '@nocobase/app-database';

/**
 * Legacy schema builders kept only so already-published App migrations remain
 * loadable and checksum-stable. New authorization code must use the plugin
 * migrations under the feature-specific exports instead.
 */
export function createPermissionSetCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection('authzPermissionSets', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('key', { length: 255 }).notNull();
    collection.string('title', { length: 255 }).notNull();
    collection.text('description').nullable();
    timestamps(collection);
    collection
      .hasMany('objectPermissions', 'authzObjectPermissions')
      .foreignKey('permissionSetId');
    collection
      .hasMany('groupItems', 'authzPermissionSetGroupItems')
      .foreignKey('permissionSetId');
    collection.primary('id', { name: 'pk_authz_permission_sets' });
    collection.unique('key', { name: 'uq_authz_permission_sets_key' });
  });
}

export function createPermissionSetGroupCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection('authzPermissionSetGroups', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('key', { length: 255 }).notNull();
    collection.string('title', { length: 255 }).notNull();
    collection.text('description').nullable();
    timestamps(collection);
    collection
      .hasMany('items', 'authzPermissionSetGroupItems')
      .foreignKey('permissionSetGroupId');
    collection.primary('id', { name: 'pk_authz_permission_set_groups' });
    collection.unique('key', { name: 'uq_authz_permission_set_groups_key' });
  });
}

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

export function createObjectPermissionCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection('authzObjectPermissions', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('permissionSetId', { length: 64 }).notNull();
    collection.string('resource', { length: 255 }).notNull();
    collection.json('actions').notNull();
    timestamps(collection);
    collection
      .belongsTo('permissionSet', 'authzPermissionSets', { index: false })
      .foreignKey('permissionSetId')
      .constraints(false);
    collection.primary('id', { name: 'pk_authz_object_permissions' });
    collection.unique(['permissionSetId', 'resource'], {
      name: 'uq_authz_object_permissions_set_resource',
    });
    collection.index('resource', {
      name: 'idx_authz_object_permissions_resource',
    });
  });
}

export function createAssignmentCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection('authzAssignments', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('subjectType', { length: 64 }).notNull();
    collection.string('subjectId', { length: 64 }).notNull();
    collection.string('targetType', { length: 64 }).notNull();
    collection.string('targetId', { length: 64 }).notNull();
    collection.datetime('startsAt').nullable();
    collection.datetime('expiresAt').nullable();
    timestamps(collection);
    collection.primary('id', { name: 'pk_authz_assignments' });
    collection.unique(['subjectType', 'subjectId', 'targetType', 'targetId'], {
      name: 'uq_authz_assignments_subject_target',
    });
    collection.index(['subjectType', 'subjectId'], {
      name: 'idx_authz_assignments_subject',
    });
    collection.index(['targetType', 'targetId'], {
      name: 'idx_authz_assignments_target',
    });
    collection.index('expiresAt', { name: 'idx_authz_assignments_expires_at' });
  });
}

export function createOrganizationWideDefaultCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection(
    'authzOrganizationWideDefaults',
    (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('resource', { length: 255 }).notNull();
      collection
        .string('access', { length: 32 })
        .notNull()
        .defaultTo('private');
      timestamps(collection);
      collection.primary('id', { name: 'pk_authz_organization_wide_defaults' });
      collection.unique('resource', {
        name: 'uq_authz_organization_wide_defaults_resource',
      });
    },
  );
}

export function createSharingRuleCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection('authzSharingRules', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('key', { length: 255 }).notNull();
    collection.string('title', { length: 255 }).nullable();
    collection.string('resource', { length: 255 }).notNull();
    collection.json('actions').notNull();
    collection.json('subjects').notNull();
    collection.string('recordType', { length: 32 }).notNull();
    collection.json('scopes').nullable();
    collection.datetime('startsAt').nullable();
    collection.datetime('expiresAt').nullable();
    collection.text('reason').nullable();
    timestamps(collection);
    collection.primary('id', { name: 'pk_authz_sharing_rules' });
    collection.unique('key', { name: 'uq_authz_sharing_rules_key' });
    collection.index('resource', { name: 'idx_authz_sharing_rules_resource' });
  });
}

export function createSharingRuleRecordCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection('authzSharingRuleRecords', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('sharingRuleId', { length: 64 }).notNull();
    collection.string('recordId', { length: 255 }).notNull();
    collection.datetime('createdAt').notNull();
    collection
      .belongsTo('sharingRule', 'authzSharingRules', { index: false })
      .foreignKey('sharingRuleId')
      .constraints(false);
    collection.primary('id', { name: 'pk_authz_sharing_rule_records' });
    collection.unique(['sharingRuleId', 'recordId'], {
      name: 'uq_authz_sharing_rule_records_pair',
    });
    collection.index(['recordId', 'sharingRuleId'], {
      name: 'idx_authz_sharing_rule_records_record',
    });
  });
}

export function createRestrictionRuleCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection('authzRestrictionRules', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('key', { length: 255 }).notNull();
    collection.string('title', { length: 255 }).nullable();
    collection.string('resource', { length: 255 }).notNull();
    collection.json('actions').notNull();
    collection.json('subjects').notNull();
    collection.json('scopes').notNull();
    timestamps(collection);
    collection.primary('id', { name: 'pk_authz_restriction_rules' });
    collection.unique('key', { name: 'uq_authz_restriction_rules_key' });
    collection.index('resource', {
      name: 'idx_authz_restriction_rules_resource',
    });
  });
}

export function createAuditLogCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection('authzAuditLogs', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('event', { length: 128 }).notNull();
    collection.string('actorType', { length: 64 }).notNull();
    collection.string('actorId', { length: 64 }).nullable();
    collection.string('resourceType', { length: 128 }).nullable();
    collection.string('resourceId', { length: 64 }).nullable();
    collection.json('details').notNull();
    collection.datetime('createdAt').notNull();
    collection.primary('id', { name: 'pk_authz_audit_logs' });
    collection.index(['event', 'createdAt'], {
      name: 'idx_authz_audit_logs_event_created',
    });
    collection.index(['actorType', 'actorId'], {
      name: 'idx_authz_audit_logs_actor',
    });
  });
}

function timestamps(collection: CollectionDefinitionBuilder): void {
  collection.datetime('createdAt').notNull();
  collection.datetime('updatedAt').notNull();
}
