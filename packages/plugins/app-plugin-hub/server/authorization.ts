import { removeUserApiKeys } from '@nocobase/app-plugin-api-keys/server';
import { HUB_API_KEY_CONFIG_ID } from './api-key-auth.js';
import { lockUserForAdministration } from '@nocobase/app-plugin-authentication';
import { HUB_RELEASE_ACTIONS } from '../shared/permissions.js';
import type { DatabaseConnection } from '@nocobase/db';
import {
  grantBacked,
  type Authorization,
  type PermissionSetsApi,
} from '@nocobase/app-plugin-authorization';
import type { AuthorizationGrant } from '@nocobase/authorization/core';
import {
  UserManagementError,
  UserRoleScopeError,
  type UserRoleScope,
  type UserRoleValue,
} from '@nocobase/app-plugin-users/server/tokens';

export const HUB_PERMISSION_SET_KEYS: readonly [
  'hub-administrator',
  'hub-operator',
] = ['hub-administrator', 'hub-operator'] as const;

export const HUB_ADMINISTRATOR: 'hub-administrator' =
  HUB_PERMISSION_SET_KEYS[0];

const HUB_APP_ACTIONS = new Set([
  'read',
  'read-all',
  'create',
  'update-settings',
  'remove',
  'manage-api-keys',
  'read-release',
  HUB_RELEASE_ACTIONS.upload,
  'read-config-template',
  'read-deployment',
  'read-log',
  HUB_RELEASE_ACTIONS.deploy,
  'rollback',
  'read-config',
  'update-config',
  'refresh',
  'start',
  'stop',
  'restart',
]);

/**
 * Hub owns its three Permission Sets: the generic management API may not
 * change them. The administrator set carries one rule more, because it is the
 * only way back into a Hub that has lost its last administrator.
 */
export function protectHubPermissionSets(
  permissionSets: Pick<PermissionSetsApi, 'protect'>,
): () => void {
  const releases = [
    permissionSets.protect({
      owner: '@nocobase/app-plugin-hub',
      keys: [HUB_ADMINISTRATOR],
      requireActiveAssignment: true,
    }),
    permissionSets.protect({
      owner: '@nocobase/app-plugin-hub',
      keys: HUB_PERMISSION_SET_KEYS.filter((key) => key !== HUB_ADMINISTRATOR),
    }),
  ];
  return (): void => {
    for (const release of releases) release();
  };
}

export function registerHubResources(
  authorization: Pick<Authorization, 'resourceTypes'>,
  connection: DatabaseConnection,
): void {
  const administrator = (grants: readonly AuthorizationGrant[]): boolean =>
    grants.some(
      (grant) =>
        grant.source.plugin === 'permission-sets' &&
        grant.source.id === HUB_ADMINISTRATOR,
    );
  // Record types: the ids are app and host ids, judged per record.
  authorization.resourceTypes.add({
    type: 'hub.app',
    actions: [
      ...[...HUB_APP_ACTIONS].filter((action) => action !== 'read-all'),
      {
        // A catalog-wide read, derived only from the administrator's read grant.
        name: 'read-all',
        authorize: (request, context) =>
          grantBacked({
            also: async (_request, grants) => administrator(grants),
          })({ ...request, action: 'read' }, context),
      },
    ],
    authorize: grantBacked({
      also: async (request, grants) => {
        if (administrator(grants)) return true;
        if (request.principal.type !== 'user') return false;
        if (request.resource.id === '*') return true;
        return Boolean(
          await connection.query
            .selectFrom('hubApps')
            .select('id')
            .where('id', '=', request.resource.id)
            .where('createdBy', '=', request.principal.id)
            .executeTakeFirst(),
        );
      },
    }),
  });
  authorization.resourceTypes.add({
    type: 'hub.host',
    actions: ['read'],
    authorize: grantBacked(),
  });
}

export function createHubUserRoleScope(
  permissionSets: PermissionSetsApi,
): UserRoleScope {
  const managedPermissionSets = [...HUB_PERMISSION_SET_KEYS];
  return {
    key: 'hub',
    label: 'Hub role',
    labelI18nKey: 'roles.scope',
    labelI18nNs: '@nocobase/app-plugin-hub',
    selection: 'single',
    requiredOnCreate: true,
    options: () =>
      Promise.resolve([
        {
          value: 'hub-administrator',
          label: 'Platform Administrator',
          labelI18nKey: 'roles.names.hub-administrator',
          labelI18nNs: '@nocobase/app-plugin-hub',
          description:
            'Manage all applications, publishing API Keys, and user permissions',
        },
        {
          value: 'hub-operator',
          label: 'Application Administrator',
          labelI18nKey: 'roles.names.hub-operator',
          labelI18nNs: '@nocobase/app-plugin-hub',
          description:
            'Manage applications you create and your own publishing API Keys',
        },
      ]),
    async get(userId, connection) {
      const assignments = await permissionSets
        .withTransaction(connection)
        .listAssignments();
      return (
        assignments.find(
          (assignment) =>
            assignment.subject.type === 'user' &&
            assignment.subject.id === userId &&
            isHubPermissionSet(assignment.permissionSet),
        )?.permissionSet ?? ''
      );
    },
    async getMany(userIds, connection) {
      const requested = new Set(userIds);
      const roles: Record<string, string> = Object.fromEntries(
        userIds.map((userId) => [userId, '']),
      );
      const assignments = await permissionSets
        .withTransaction(connection)
        .listAssignments();
      for (const assignment of assignments) {
        if (
          assignment.subject.type === 'user' &&
          requested.has(assignment.subject.id) &&
          isHubPermissionSet(assignment.permissionSet)
        ) {
          roles[assignment.subject.id] = assignment.permissionSet;
        }
      }
      return roles;
    },
    async findUserIds(role, connection) {
      requireHubRole(role);
      const assignments = await permissionSets
        .withTransaction(connection)
        .listAssignments(role);
      return assignments
        .filter((assignment) => assignment.subject.type === 'user')
        .map((assignment) => assignment.subject.id);
    },
    async replace(userId, value, connection) {
      const role = singleRole(value);
      // Serialize every Hub role change on one stable row before taking the
      // snapshot used by the final-administrator check.

      const current = await currentHubRole(permissionSets, userId, connection);
      if (current === HUB_ADMINISTRATOR && role !== HUB_ADMINISTRATOR) {
        await permissionSets
          .withTransaction(connection)
          .assertSubjectRemovable({ type: 'user', id: userId });
      }
      await permissionSets
        .withTransaction(connection)
        .replaceSubjectAssignments({
          subject: { type: 'user', id: userId },
          managedPermissionSets,
          permissionSets: [role],
        });
    },
    onDelete: (userId, connection) =>
      removeUserApiKeys(connection, userId, ['default', HUB_API_KEY_CONFIG_ID]),
    async assertCanDelete(userId, actorId, connection) {
      const actor = await connection.query
        .selectFrom('user')
        .select('disabledAt')
        .where('id', '=', actorId)
        .executeTakeFirst();
      if (
        !actor ||
        actor.disabledAt != null ||
        (await currentHubRole(permissionSets, actorId, connection)) !==
          HUB_ADMINISTRATOR
      ) {
        throw new UserRoleScopeError(
          'HUB_ADMIN_REQUIRED',
          'Only a platform administrator can delete users.',
          409,
        );
      }
      if (
        (await currentHubRole(permissionSets, userId, connection)) ===
        HUB_ADMINISTRATOR
      )
        await permissionSets
          .withTransaction(connection)
          .assertSubjectRemovable({ type: 'user', id: userId });
      await lockUserForAdministration(connection, userId);
      const app = await connection.query
        .selectFrom('hubApps')
        .select('id')
        .where('createdBy', '=', userId)
        .executeTakeFirst();
      if (app)
        throw new UserRoleScopeError(
          'USER_HAS_APPS',
          'Transfer or delete this user’s applications before deleting the user.',
          409,
        );
    },
    async assertCanDisable(userId, connection) {
      const current = await currentHubRole(permissionSets, userId, connection);
      if (current === HUB_ADMINISTRATOR) {
        await permissionSets
          .withTransaction(connection)
          .assertSubjectRemovable({ type: 'user', id: userId });
      }
    },
  };
}

function isHubPermissionSet(value: string): boolean {
  return (HUB_PERMISSION_SET_KEYS as readonly string[]).includes(value);
}

function requireHubRole(value: string): void {
  if (!isHubPermissionSet(value)) {
    throw new UserManagementError(
      'INVALID_ROLE_SCOPE_VALUE',
      `Unknown Hub role: ${value}`,
    );
  }
}

function singleRole(value: UserRoleValue): string {
  if (typeof value !== 'string') {
    throw new UserManagementError(
      'INVALID_ROLE_SCOPE_VALUE',
      'The Hub role scope accepts exactly one role',
    );
  }
  requireHubRole(value);
  return value;
}

async function currentHubRole(
  permissionSets: PermissionSetsApi,
  userId: string,
  connection: DatabaseConnection,
): Promise<string | undefined> {
  const assignments = await permissionSets
    .withTransaction(connection)
    .listAssignments();
  return assignments.find(
    (assignment) =>
      assignment.subject.type === 'user' &&
      assignment.subject.id === userId &&
      isHubPermissionSet(assignment.permissionSet),
  )?.permissionSet;
}
