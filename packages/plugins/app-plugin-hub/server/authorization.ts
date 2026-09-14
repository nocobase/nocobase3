import type {
  Authorization,
  PermissionSetsApi,
} from '@nocobase/app-plugin-authorization';
import {
  UserManagementError,
  type UserRoleScope,
  type UserRoleValue,
} from '@nocobase/app-plugin-users/server/tokens';

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
  authorization: Pick<Authorization, 'resources'>,
): void {
  registerGrantBackedResource(authorization, 'hub.app', HUB_APP_ACTIONS);
  registerGrantBackedResource(authorization, 'hub.host', new Set(['read']));
}

function registerGrantBackedResource(
  authorization: Pick<Authorization, 'resources'>,
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
  permissionSets: PermissionSetsApi,
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
      // The library refuses a replacement that would take away the last
      // administrator who can still act, so there is nothing to check here.
      await permissionSets
        .withTransaction(connection)
        .replaceSubjectAssignments({
          subject: { type: 'user', id: userId },
          managedPermissionSets,
          permissionSets: [role],
        });
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
