import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  protectedPermissionSetRegistryToken,
  type AppAuthorization,
  type ProtectedPermissionSetRegistry,
} from '@nocobase/app-plugin-authorization';
import {
  UserManagementError,
  UserRoleScopeError,
  userRoleScopeRegistryToken,
  type UserRoleScope,
  type UserRoleScopeRegistry,
  type UserRoleValue,
} from '@nocobase/app-plugin-users/server/tokens';
import type { DatabaseConnection } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

const SYSTEM_ADMINISTRATOR = 'system-administrator';
const USERS_I18N_NAMESPACE = '@nocobase/app-plugin-users';

export default class UserRolesProvider extends ServiceProvider<Application> {
  public readonly name = 'app/user-roles';
  private unregister?: () => void;

  public override boot(): Promise<void> {
    if (this.unregister) return Promise.resolve();
    if (
      !this.app.container.has(authorizationToken) ||
      !this.app.container.has(protectedPermissionSetRegistryToken) ||
      !this.app.container.has(userRoleScopeRegistryToken)
    ) {
      return Promise.resolve();
    }
    const authorization = this.app.container.resolve(authorizationToken);
    const protectedPermissionSets = this.app.container.resolve(
      protectedPermissionSetRegistryToken,
    );
    const registry = this.app.container.resolve<UserRoleScopeRegistry>(
      userRoleScopeRegistryToken,
    );
    this.unregister = registry.register(
      createApplicationUserRoleScope(authorization, protectedPermissionSets),
    );
    return Promise.resolve();
  }

  public override shutdown(): Promise<void> {
    this.unregister?.();
    this.unregister = undefined;
    return Promise.resolve();
  }
}

export function createApplicationUserRoleScope(
  authorization: Pick<AppAuthorization, 'permissionSets'>,
  protectedPermissionSets: Pick<ProtectedPermissionSetRegistry, 'isProtected'>,
): UserRoleScope {
  return {
    key: 'app',
    label: 'Roles',
    labelI18nKey: 'page.roles',
    labelI18nNs: USERS_I18N_NAMESPACE,
    selection: 'multiple',
    hasAuthenticatedDefaultAccess: true,
    async options() {
      const state = await directRoleState(
        authorization,
        protectedPermissionSets,
      );
      return state.permissionSets.map((permissionSet) => {
        return {
          value: permissionSet.key,
          label: permissionSet.title?.trim() || permissionSet.key,
          ...(permissionSet.key === SYSTEM_ADMINISTRATOR
            ? {
                labelI18nKey: 'page.systemAdministrator',
                labelI18nNs: USERS_I18N_NAMESPACE,
                assignable: false,
                removable: false,
              }
            : {}),
        };
      });
    },
    async get(userId, connection) {
      const state = await directRoleState(
        authorization,
        protectedPermissionSets,
        connection,
      );
      return rolesForUser(userId, state);
    },
    async getMany(userIds, connection) {
      const state = await directRoleState(
        authorization,
        protectedPermissionSets,
        connection,
      );
      return Object.fromEntries(
        userIds.map((userId) => [userId, rolesForUser(userId, state)]),
      );
    },
    async findUserIds(role, connection) {
      const state = await directRoleState(
        authorization,
        protectedPermissionSets,
        connection,
      );
      requireDirectRole(
        role,
        state.permissionSets.map(({ key }) => key),
      );
      return state.assignments
        .filter(
          (assignment) =>
            assignment.permissionSet === role &&
            assignment.subject.type === 'user',
        )
        .map((assignment) => assignment.subject.id);
    },
    async replace(userId, value, connection) {
      const requested = multipleRoles(value);
      const state = await directRoleState(
        authorization,
        protectedPermissionSets,
        connection,
      );
      const managed = state.permissionSets.map(({ key }) => key);
      for (const role of requested) requireDirectRole(role, managed);

      const current = state.assignments
        .filter(
          (assignment) =>
            assignment.subject.type === 'user' &&
            assignment.subject.id === userId &&
            managed.includes(assignment.permissionSet),
        )
        .map((assignment) => assignment.permissionSet);
      const currentSet = new Set(current);
      const requestedSet = new Set(requested);
      if (
        currentSet.has(SYSTEM_ADMINISTRATOR) !==
        requestedSet.has(SYSTEM_ADMINISTRATOR)
      ) {
        throw new UserRoleScopeError(
          'PROTECTED_ROLE_ASSIGNMENT',
          'The system-administrator role cannot be assigned or removed from User management',
          409,
        );
      }

      await authorization.permissionSets
        .withConnection(connection)
        .replaceSubjectAssignments({
          subject: { type: 'user', id: userId },
          managedPermissionSets: managed,
          permissionSets: requested,
        });
    },
  };
}

function rolesForUser(
  userId: string,
  state: Awaited<ReturnType<typeof directRoleState>>,
): readonly string[] {
  const directKeys = new Set(state.permissionSets.map(({ key }) => key));
  return state.assignments
    .filter(
      (assignment) =>
        assignment.subject.type === 'user' &&
        assignment.subject.id === userId &&
        directKeys.has(assignment.permissionSet),
    )
    .map((assignment) => assignment.permissionSet);
}

async function directRoleState(
  authorization: Pick<AppAuthorization, 'permissionSets'>,
  protectedPermissionSets: Pick<ProtectedPermissionSetRegistry, 'isProtected'>,
  connection?: DatabaseConnection,
) {
  const permissionSets = connection
    ? authorization.permissionSets.withConnection(connection)
    : authorization.permissionSets;
  const [sets, assignments] = await Promise.all([
    permissionSets.list(),
    permissionSets.listAssignments(),
  ]);
  const authenticatedDefaults = new Set(
    assignments
      .filter(
        (assignment) =>
          assignment.subject.type === 'authenticated' &&
          assignment.subject.id === '*',
      )
      .map((assignment) => assignment.permissionSet),
  );
  return {
    permissionSets: sets.filter(
      ({ key }) =>
        !authenticatedDefaults.has(key) &&
        (key === SYSTEM_ADMINISTRATOR ||
          !protectedPermissionSets.isProtected(key)),
    ),
    assignments,
  };
}

function requireDirectRole(role: string, available: readonly string[]): void {
  if (!available.includes(role)) {
    throw new UserManagementError(
      'INVALID_ROLE_SCOPE_VALUE',
      `Unknown application role: ${role}`,
    );
  }
}

function multipleRoles(value: UserRoleValue): readonly string[] {
  if (typeof value === 'string') {
    throw new UserManagementError(
      'INVALID_ROLE_SCOPE_VALUE',
      'The application role scope accepts a role list',
    );
  }
  return [...value];
}
