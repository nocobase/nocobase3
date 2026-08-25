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

const crmResources = [
  'agent_crm_accounts',
  'agent_crm_contacts',
  'agent_crm_leads',
  'agent_crm_opportunities',
  'agent_crm_activities',
] as const;
const authorizationResources = [...crmResources, 'user'] as const;

const ownerResources = new Set([
  'agent_crm_leads',
  'agent_crm_opportunities',
  'agent_crm_activities',
]);

const roles = [
  {
    id: 'crm-role-admin',
    key: 'crm-admin',
    title: '管理员',
    description: '管理 App 成员、角色和权限，并访问全部 CRM 数据。',
  },
  {
    id: 'crm-role-sales-manager',
    key: 'crm-sales-manager',
    title: '销售经理',
    description: '管理全部 CRM 业务数据，不管理 App 权限配置。',
  },
  {
    id: 'crm-role-sales',
    key: 'crm-sales',
    title: '销售人员',
    description: '查看公共客户资料，并管理本人负责的线索、商机和跟进任务。',
  },
] as const;

const allActions = ['list', 'get', 'create', 'update', 'destroy', 'query'];
const readActions = ['list', 'get', 'query'];

const migration: MigrationDefinition = defineMigration({
  name: '202608240001_create_access_control',

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

    await builder.createCollection('crmAppMembers', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.string('status', { length: 32 }).notNull().defaultTo('active');
      timestamps(collection);
      collection.primary('id', { name: 'pk_crm_app_members' });
      collection.unique('userId', { name: 'uq_crm_app_members_user' });
      collection.index('status', { name: 'idx_crm_app_members_status' });
    });

    await builder.alterCollection('agent_crm_activities', (collection) => {
      collection.string('ownerId', { length: 64 }).nullable();
      collection.index('ownerId', { name: 'idx_crm_activities_owner' });
    });

    const knex = await connection.client<Knex>();
    const now = new Date().toISOString();
    await knex('authzPermissionSets').insert(
      roles.map((role) => ({ ...role, createdAt: now, updatedAt: now })),
    );

    const permissions: Array<Record<string, unknown>> = [];
    for (const role of roles) {
      for (const resource of authorizationResources) {
        const actions = defaultActions(role.key, resource).map((action) => ({
          action,
          inputFields: '*',
          outputFields: '*',
          ...(action === 'create'
            ? {}
            : {
                recordScope: [
                  {
                    policy:
                      role.key === 'crm-sales' && ownerResources.has(resource)
                        ? 'recordsIOwn'
                        : 'allRecords',
                  },
                ],
              }),
        }));
        if (!actions.length) continue;
        permissions.push({
          id: `crm-permission-${role.key}-${resource}`,
          permissionSetId: role.id,
          resource,
          actions: JSON.stringify(actions),
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    await knex('authzObjectPermissions').insert(permissions);
  },

  async down({ builder }: MigrationContext): Promise<void> {
    await builder.alterCollection('agent_crm_activities', (collection) => {
      collection.dropIndex('idx_crm_activities_owner');
      collection.dropField('ownerId');
    });
    await builder.dropCollection('crmAppMembers');
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

function timestamps(collection: CollectionDefinitionBuilder): void {
  collection.datetime('createdAt').notNull();
  collection.datetime('updatedAt').notNull();
}

function defaultActions(
  role: (typeof roles)[number]['key'],
  resource: (typeof authorizationResources)[number],
): string[] {
  if (resource === 'user') return readActions;
  if (role === 'crm-admin' || role === 'crm-sales-manager') {
    return allActions;
  }
  return ownerResources.has(resource) ? allActions : readActions;
}

export default migration;
