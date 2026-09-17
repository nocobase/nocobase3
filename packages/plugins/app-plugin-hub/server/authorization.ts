import { removeUserApiKeys } from '@nocobase/app-plugin-api-keys/server';
import { HUB_API_KEY_CONFIG_ID } from './api-key-auth.js';
import { lockUserForAdministration } from '@nocobase/app-plugin-authentication';
import { HUB_RELEASE_ACTIONS } from '../shared/permissions.js';
import type { DatabaseConnection } from '@nocobase/db';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import {
  UserManagementError,
  UserRoleScopeError,
  type UserRoleScope,
  type UserRoleValue,
} from '@nocobase/app-plugin-users/server/tokens';
import type { Knex } from 'knex';

export const HUB_PERMISSION_SET_KEYS: readonly [
  'hub-administrator',
  'hub-operator',
  'hub-viewer',
] = ['hub-administrator', 'hub-operator', 'hub-viewer'] as const;

export const HUB_ACTIVE_ROLE_KEYS = [
  'hub-administrator',
  'hub-operator',
] as const;

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
  HUB_RELEASE_ACTIONS.deploy,
  'rollback',
  'read-config',
  'update-config',
  'refresh',
  'start',
  'stop',
  'restart',
]);

export function registerHubResources(
  authorization: Pick<AppAuthorization, 'resources'>,
  connection: DatabaseConnection,
): void {
  registerGrantBackedResource(
    authorization,
    'hub.app',
    HUB_APP_ACTIONS,
    connection,
  );
  registerGrantBackedResource(
    authorization,
    'hub.host',
    new Set(['read']),
    connection,
  );
}

function registerGrantBackedResource(
  authorization: Pick<AppAuthorization, 'resources'>,
  resourceType: 'hub.app' | 'hub.host',
  actions: ReadonlySet<string>,
  connection: DatabaseConnection,
): void {
  authorization.resources.add({
    resourceType,
    async authorize(request, context) {
      if (!actions.has(request.action)) {
        return {
          effect: 'deny',
          reasons: [
            {
              code: 'HUB_ACTION_NOT_SUPPORTED',
              message: `${resourceType} does not support action "${request.action}"`,
              plugin: '@nocobase/app-plugin-hub',
            },
          ],
        };
      }
      // read-all is a catalog scope check, derived only from the Hub Administrator's read grant.
      const grants = await context.grants.resolve({
        principal: request.principal,
        subjects: request.subjects,
        resource: request.resource,
        action: request.action === 'read-all' ? 'read' : request.action,
      });
      const staticGrants = grants.filter((grant) => grant.policy === undefined);
      const administrator = staticGrants.some(
        (grant) =>
          grant.source.plugin === 'permission-sets' &&
          grant.source.id === HUB_ADMINISTRATOR,
      );
      let ownsApp = true;
      if (resourceType === 'hub.app' && !administrator) {
        if (
          request.action === 'read-all' ||
          request.principal.type !== 'user'
        ) {
          ownsApp = false;
        } else if (request.resource.id !== '*') {
          const app = await connection.query
            .selectFrom('hubApps')
            .select('id')
            .where('id', '=', request.resource.id)
            .where('createdBy', '=', request.principal.id)
            .executeTakeFirst();
          ownsApp = Boolean(app);
        }
      }
      return staticGrants.length && ownsApp
        ? {
            effect: 'permit',
            reasons: staticGrants.map((grant) => ({
              code: 'HUB_ACCESS_GRANTED',
              message: `${grant.source.plugin}:${grant.source.id} allows Hub access`,
              plugin: '@nocobase/app-plugin-hub',
            })),
          }
        : {
            effect: 'deny',
            reasons: [
              {
                code: 'HUB_ACCESS_DENIED',
                message: 'Hub access is not allowed',
                plugin: '@nocobase/app-plugin-hub',
              },
            ],
          };
    },
  });
}

export function createHubUserRoleScope(
  authorization: Pick<AppAuthorization, 'permissionSets'>,
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
        {
          value: 'hub-viewer',
          label: 'Viewer (legacy)',
          assignable: false,
          labelI18nKey: 'roles.names.hub-viewer',
          labelI18nNs: '@nocobase/app-plugin-hub',
          description: 'View your own applications and runtime status.',
        },
      ]),
    async get(userId, connection) {
      const assignments = await authorization.permissionSets
        .withConnection(connection)
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
      const assignments = await authorization.permissionSets
        .withConnection(connection)
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
      const assignments = await authorization.permissionSets
        .withConnection(connection)
        .listAssignments(role);
      return assignments
        .filter((assignment) => assignment.subject.type === 'user')
        .map((assignment) => assignment.subject.id);
    },
    async replace(userId, value, connection) {
      const role = singleRole(value);
      // Serialize every Hub role change on one stable row before taking the
      // snapshot used by the final-administrator check.
      await lockAdministratorRole(connection);
      const current = await currentHubRole(authorization, userId, connection);
      if (role === 'hub-viewer') {
        if (current === role) return;
        throw new UserManagementError(
          'INVALID_ROLE_SCOPE_VALUE',
          'The legacy Viewer role can no longer be assigned.',
        );
      }
      if (current === HUB_ADMINISTRATOR && role !== HUB_ADMINISTRATOR) {
        await assertAdministratorCanBeRemoved(userId, connection);
      }
      await authorization.permissionSets
        .withConnection(connection)
        .replaceSubjectAssignments({
          subject: { type: 'user', id: userId },
          managedPermissionSets,
          permissionSets: [role],
        });
    },
    onDelete: (userId, connection) =>
      removeUserApiKeys(connection, userId, ['default', HUB_API_KEY_CONFIG_ID]),
    async assertCanDelete(userId, actorId, connection) {
      await lockAdministratorRole(connection);
      const actor = await connection.query
        .selectFrom('user')
        .select('disabledAt')
        .where('id', '=', actorId)
        .executeTakeFirst();
      if (
        !actor ||
        actor.disabledAt != null ||
        (await currentHubRole(authorization, actorId, connection)) !==
          HUB_ADMINISTRATOR
      ) {
        throw new UserRoleScopeError(
          'HUB_ADMIN_REQUIRED',
          'Only a platform administrator can delete users.',
          409,
        );
      }
      if (
        (await currentHubRole(authorization, userId, connection)) ===
        HUB_ADMINISTRATOR
      )
        await assertAdministratorCanBeRemoved(userId, connection);
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
      await lockAdministratorRole(connection);
      const current = await currentHubRole(authorization, userId, connection);
      if (current === HUB_ADMINISTRATOR) {
        await assertAdministratorCanBeRemoved(userId, connection);
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
  authorization: Pick<AppAuthorization, 'permissionSets'>,
  userId: string,
  connection: DatabaseConnection,
): Promise<string | undefined> {
  const assignments = await authorization.permissionSets
    .withConnection(connection)
    .listAssignments();
  return assignments.find(
    (assignment) =>
      assignment.subject.type === 'user' &&
      assignment.subject.id === userId &&
      isHubPermissionSet(assignment.permissionSet),
  )?.permissionSet;
}

async function assertAdministratorCanBeRemoved(
  userId: string,
  connection: DatabaseConnection,
): Promise<void> {
  const user = await connection.query
    .selectFrom('user')
    .select(['id', 'disabledAt'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!user || user.disabledAt != null) return;
  const count = await enabledAdministratorCount(connection);
  if (count <= 1) {
    throw new UserRoleScopeError(
      'LAST_HUB_ADMIN',
      'The last active platform administrator cannot be deleted, disabled, or assigned another role',
      409,
    );
  }
}

async function lockAdministratorRole(
  connection: DatabaseConnection,
): Promise<void> {
  if (connection.dialect === 'sqlite') {
    await connection.query
      .updateTable('authorizationPermissionSets')
      .set({ updatedAt: new Date() })
      .where('key', '=', HUB_ADMINISTRATOR)
      .execute();
    return;
  }
  const physical = await connection.collections.getPhysical(
    'authorizationPermissionSets',
  );
  if (!physical) {
    throw new Error('Authorization Permission Set schema is unavailable');
  }
  const knex = await connection.client<Knex>();
  await knex(physical.tableName)
    .where({ key: HUB_ADMINISTRATOR })
    .select('id')
    .forUpdate();
}

async function enabledAdministratorCount(
  connection: DatabaseConnection,
): Promise<number> {
  const row = await connection.query
    .selectFrom('authorizationPermissionSetAssignments')
    .innerJoin(
      'user',
      'user.id',
      'authorizationPermissionSetAssignments.subjectId',
    )
    .select(({ fn }) => [fn.countAll().as('count')])
    .where('authorizationPermissionSetAssignments.subjectType', '=', 'user')
    .where(
      'authorizationPermissionSetAssignments.permissionSetKey',
      '=',
      HUB_ADMINISTRATOR,
    )
    .where('user.disabledAt', 'is', null)
    .executeTakeFirst<{ readonly count: number | string }>();
  return Number(row?.count ?? 0);
}
