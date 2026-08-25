import { createAssignmentCollection } from '@nocobase/authorization/storage/collections/assignment';
import { createAuditLogCollection } from '@nocobase/authorization/storage/collections/audit-log';
import { createObjectPermissionCollection } from '@nocobase/authorization/storage/collections/object-permission';
import { createOrganizationWideDefaultCollection } from '@nocobase/authorization/storage/collections/organization-wide-default';
import { createPermissionSetGroupItemCollection } from '@nocobase/authorization/storage/collections/permission-set-group-item';
import { createPermissionSetGroupCollection } from '@nocobase/authorization/storage/collections/permission-set-group';
import { createPermissionSetCollection } from '@nocobase/authorization/storage/collections/permission-set';
import { createRestrictionRuleCollection } from '@nocobase/authorization/storage/collections/restriction-rule';
import { createSharingRuleRecordCollection } from '@nocobase/authorization/storage/collections/sharing-rule-record';
import { createSharingRuleCollection } from '@nocobase/authorization/storage/collections/sharing-rule';
import {
  defineMigration,
  type CollectionDefinitionBuilder,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/database';
import type { Knex } from 'knex';

import type {
  AppAccessControlDefinition,
  AppAccessDefaultPermission,
} from '../types.js';
import { normalizeAccessControlDefinition } from './options.js';

export function createAppAccessControlMigration(
  name: string,
  input: AppAccessControlDefinition,
): MigrationDefinition {
  const definition = normalizeAccessControlDefinition(input);
  const memberTableName = definition.memberTableName ?? 'appMembers';
  const constraintPrefix = definition.appKey.replace(/[^a-z0-9]+/gi, '_');

  return defineMigration({
    name,
    async up({ builder, connection }: MigrationContext): Promise<void> {
      await createPermissionSetCollection(builder);
      await createPermissionSetGroupCollection(builder);
      await createPermissionSetGroupItemCollection(builder);
      await createObjectPermissionCollection(builder);
      await createAssignmentCollection(builder);
      await createOrganizationWideDefaultCollection(builder);
      await createSharingRuleCollection(builder);
      await createSharingRuleRecordCollection(builder);
      await createRestrictionRuleCollection(builder);
      await createAuditLogCollection(builder);

      await builder.createCollection(memberTableName, (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('userId', { length: 64 }).notNull();
        collection
          .string('status', { length: 32 })
          .notNull()
          .defaultTo('active');
        timestamps(collection);
        collection.primary('id', { name: `pk_${constraintPrefix}_members` });
        collection.unique('userId', {
          name: `uq_${constraintPrefix}_member_user`,
        });
        collection.index('status', {
          name: `idx_${constraintPrefix}_member_status`,
        });
      });

      const knex = await connection.client<Knex>();
      const now = new Date().toISOString();
      const roleIds = new Map<string, string>();
      const roleRows = definition.roles.map((role, index) => {
        const id = `${definition.appKey}-role-${index + 1}`;
        roleIds.set(role.key, id);
        return {
          id,
          key: role.key,
          title: role.title,
          description: role.description,
          createdAt: now,
          updatedAt: now,
        };
      });
      await knex('authzPermissionSets').insert(roleRows);

      const permissions: Array<Record<string, unknown>> = [];
      for (const role of definition.roles) {
        for (const permission of role.permissions) {
          permissions.push({
            id: crypto.randomUUID(),
            permissionSetId: roleIds.get(role.key),
            resource: permission.resource,
            actions: JSON.stringify(toStoredActions(permission)),
            createdAt: now,
            updatedAt: now,
          });
        }
        permissions.push({
          id: crypto.randomUUID(),
          permissionSetId: roleIds.get(role.key),
          resource: 'user',
          actions: JSON.stringify(
            toStoredActions({
              resource: 'user',
              capabilities: ['read'],
            }),
          ),
          createdAt: now,
          updatedAt: now,
        });
      }
      await knex('authzObjectPermissions').insert(permissions);
    },
    async down({ builder }: MigrationContext): Promise<void> {
      await builder.dropCollection(memberTableName);
      await builder.dropCollection('authzAuditLogs');
      await builder.dropCollection('authzRestrictionRules');
      await builder.dropCollection('authzSharingRuleRecords');
      await builder.dropCollection('authzSharingRules');
      await builder.dropCollection('authzOrganizationWideDefaults');
      await builder.dropCollection('authzAssignments');
      await builder.dropCollection('authzObjectPermissions');
      await builder.dropCollection('authzPermissionSetGroupItems');
      await builder.dropCollection('authzPermissionSetGroups');
      await builder.dropCollection('authzPermissionSets');
    },
  });
}

function timestamps(collection: CollectionDefinitionBuilder): void {
  collection.datetime('createdAt').notNull();
  collection.datetime('updatedAt').notNull();
}

function toStoredActions(
  permission: AppAccessDefaultPermission,
): Array<Record<string, unknown>> {
  const capabilities = new Set(permission.capabilities);
  const actions = [
    ...(capabilities.has('read') ? ['list', 'get', 'query'] : []),
    ...(capabilities.has('create') ? ['create'] : []),
    ...(capabilities.has('update') ? ['update'] : []),
    ...(capabilities.has('destroy') ? ['destroy'] : []),
  ];
  return actions.map((action) => ({
    action,
    inputFields: '*',
    outputFields: '*',
    ...(action === 'create'
      ? {}
      : {
          recordScope: [
            {
              policy: permission.scope === 'own' ? 'recordsIOwn' : 'allRecords',
            },
          ],
        }),
  }));
}
