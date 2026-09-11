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

export const HUB_ADMINISTRATOR: 'hub-administrator' =
  HUB_PERMISSION_SET_KEYS[0];

const HUB_APP_ACTIONS = new Set([
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
]);

export function registerHubResources(
  authorization: Pick<AppAuthorization, 'resources'>,
): void {
  registerGrantBackedResource(authorization, 'hub.app', HUB_APP_ACTIONS);
  registerGrantBackedResource(authorization, 'hub.host', new Set(['read']));
}

function registerGrantBackedResource(
  authorization: Pick<AppAuthorization, 'resources'>,
  resourceType: 'hub.app' | 'hub.host',
  actions: ReadonlySet<string>,
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
      const grants = await context.grants.resolve({
        principal: request.principal,
        subjects: request.subjects,
        resource: request.resource,
        action: request.action,
      });
      const staticGrants = grants.filter((grant) => grant.policy === undefined);
      return staticGrants.length
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
    selection: 'single',
    requiredOnCreate: true,
    options: () =>
      Promise.resolve([
        {
          value: 'hub-administrator',
          label: 'Administrator',
          description: 'Manage applications, operations, users, and roles.',
        },
        {
          value: 'hub-operator',
          label: 'Operator',
          description: 'Deploy and operate applications.',
        },
        {
          value: 'hub-viewer',
          label: 'Viewer',
          description: 'View application and runtime status.',
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
      'The last enabled Hub Administrator cannot be disabled or assigned another role',
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
