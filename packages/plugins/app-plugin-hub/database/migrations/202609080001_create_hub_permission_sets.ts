import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const HUB_PERMISSION_SETS = [
  {
    key: 'hub-administrator',
    title: 'Hub administrator',
    grants: [
      pageGrant('hub'),
      pageGrant('users'),
      grant('hub.app', '*', [
        'read',
        'create',
        'update-settings',
        'remove',
        'read-release',
        'upload-release',
        'read-config-template',
        'read-deployment',
        'deploy',
        'rollback',
        'read-config',
        'update-config',
        'refresh',
        'start',
        'stop',
        'restart',
      ]),
      grant('hub.host', 'global', ['read']),
      grant('user', '*', [
        'read',
        'create',
        'update',
        'disable',
        'enable',
        'assign-role',
        'reset-password',
        'revoke-sessions',
      ]),
    ],
  },
  {
    key: 'hub-operator',
    title: 'Hub operator',
    grants: [
      pageGrant('hub'),
      grant('hub.app', '*', [
        'read',
        'create',
        'update-settings',
        'read-release',
        'upload-release',
        'read-config-template',
        'read-deployment',
        'deploy',
        'rollback',
        'read-config',
        'update-config',
        'refresh',
        'start',
        'stop',
        'restart',
      ]),
      grant('hub.host', 'global', ['read']),
    ],
  },
  {
    key: 'hub-viewer',
    title: 'Hub viewer',
    grants: [
      pageGrant('hub'),
      grant('hub.app', '*', ['read', 'read-release', 'read-deployment']),
      grant('hub.host', 'global', ['read']),
    ],
  },
] as const;

const HUB_PERMISSION_SET_KEYS = HUB_PERMISSION_SETS.map(({ key }) => key);

const migration: MigrationDefinition = defineMigration({
  name: '202609080001_create_hub_permission_sets',

  async up({ query }) {
    const now = new Date();
    for (const permissionSet of HUB_PERMISSION_SETS) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      const values = {
        title: permissionSet.title,
        grants: JSON.stringify(permissionSet.grants),
        updatedAt: now,
      };
      if (existing) {
        await query
          .updateTable('authorizationPermissionSets')
          .set(values)
          .where('key', '=', permissionSet.key)
          .execute();
      } else {
        await query
          .insertInto('authorizationPermissionSets')
          .values({
            id: crypto.randomUUID(),
            key: permissionSet.key,
            ...values,
            createdAt: now,
          })
          .execute();
      }
    }

    const systemAdministrators = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['subjectType', 'subjectId'])
      .where('subjectType', '=', 'user')
      .where('permissionSetKey', '=', 'system-administrator')
      .execute();
    for (const subject of systemAdministrators) {
      const subjectId = String(subject.subjectId);
      await query
        .deleteFrom('authorizationPermissionSetAssignments')
        .where('subjectType', '=', 'user')
        .where('subjectId', '=', subjectId)
        .where('permissionSetKey', 'in', HUB_PERMISSION_SET_KEYS)
        .where('permissionSetKey', '!=', 'hub-administrator')
        .execute();
      const id = `user:${subjectId}:hub-administrator`;
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('subjectType', '=', 'user')
        .where('subjectId', '=', subjectId)
        .where('permissionSetKey', '=', 'hub-administrator')
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id,
          subjectType: 'user',
          subjectId,
          permissionSetKey: 'hub-administrator',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },

  async down({ query }) {
    await query
      .deleteFrom('authorizationPermissionSetAssignments')
      .where('permissionSetKey', 'in', HUB_PERMISSION_SET_KEYS)
      .execute();
    await query
      .deleteFrom('authorizationPermissionSets')
      .where('key', 'in', HUB_PERMISSION_SET_KEYS)
      .execute();
  },
});

function pageGrant(id: string) {
  return grant('page', id, ['access']);
}

function grant(type: string, id: string, actions: readonly string[]) {
  return {
    resource: { type, id },
    actions: actions.map((action) => ({ action })),
  };
}

export default migration;
