import {
  TransactionPostCommitError,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import {
  lockUser,
  type User,
  type UserLifecycleHandler,
  type UserLifecycleRegistry,
  type UserService,
} from '@nocobase/app-plugin-users/server';
import type { AuthenticationCredentialService } from '@nocobase/app-plugin-authentication/server';
import type { PermissionSetsApi } from '@nocobase/authorization/permissions';
import type { UserQueryService } from '../user-queries.js';

import {
  UserManagementError,
  type CreateManagedUserInput,
  type ListManagedUsersInput,
  type ManagedUser,
  type UserManagementOptions,
  type UserManagementService,
  type UserRoleScope,
  type UserRoleScopeRegistry,
  type UserRoleValue,
} from '../tokens.js';

export function createUserRoleScopeRegistry(): UserRoleScopeRegistry {
  const scopes = new Map<string, UserRoleScope>();
  return {
    register(scope) {
      if (scopes.has(scope.key)) {
        throw new Error(`User role scope already registered: ${scope.key}`);
      }
      scopes.set(scope.key, scope);
      return () => {
        if (scopes.get(scope.key) === scope) scopes.delete(scope.key);
      };
    },
    get: (key) => scopes.get(key),
    list: () => [...scopes.values()],
  };
}

/** Lifecycle handler key of the Permission Set protection User management registers. */
export const PERMISSION_SET_PROTECTION_LIFECYCLE_KEY =
  'authorization.permission-sets' as const;

/**
 * A disabled or deleted account can no longer act, so either change removes
 * the subject from every Permission Set as surely as revoking would. The
 * check runs for every write path through the users plugin, not only for the
 * management API.
 */
export function createPermissionSetProtectionHandler(
  permissionSets: Pick<
    PermissionSetsApi<DatabaseConnection>,
    'withTransaction'
  >,
): UserLifecycleHandler {
  return {
    key: PERMISSION_SET_PROTECTION_LIFECYCLE_KEY,
    // After application handlers that decide who may operate at all.
    order: -100,
    before: async ({ userId, connection }) => {
      await permissionSets
        .withTransaction(connection)
        .assertSubjectRemovable({ type: 'user', id: userId });
    },
  };
}

export interface CreateUserManagementServiceOptions {
  readonly database: DatabaseManager;
  readonly users: UserService;
  readonly userQueries: UserQueryService;
  readonly credentials: AuthenticationCredentialService;
  readonly roleScopes: UserRoleScopeRegistry;
  /** Decides whether deletion is configured; the handlers it lists run inside the users plugin. */
  readonly lifecycle: UserLifecycleRegistry;
  readonly onRoleScopesChanged?: (userId: string) => void | Promise<void>;
}

export function createUserManagementService(
  options: CreateUserManagementServiceOptions,
): UserManagementService {
  return new DefaultUserManagementService(options);
}

class DefaultUserManagementService implements UserManagementService {
  constructor(private readonly services: CreateUserManagementServiceOptions) {}

  async options(): Promise<UserManagementOptions> {
    return {
      roleScopes: await Promise.all(
        this.services.roleScopes.list().map(async (scope) => ({
          key: scope.key,
          label: scope.label,
          ...(scope.labelI18nKey === undefined
            ? {}
            : { labelI18nKey: scope.labelI18nKey }),
          ...(scope.labelI18nNs === undefined
            ? {}
            : { labelI18nNs: scope.labelI18nNs }),
          selection: scope.selection,
          requiredOnCreate: scope.requiredOnCreate ?? false,
          hasAuthenticatedDefaultAccess:
            scope.hasAuthenticatedDefaultAccess ?? false,
          options: await scope.options(),
        })),
      ),
    };
  }

  async list(input: ListManagedUsersInput = {}) {
    const connection = this.services.database.connection();
    let userIds: readonly string[] | undefined;
    if (input.roleScope || input.role) {
      if (!input.roleScope || !input.role) {
        throw new UserManagementError(
          'INVALID_ROLE_SCOPE_VALUE',
          'Role filtering requires both roleScope and role',
        );
      }
      const scope = this.requireScope(input.roleScope);
      userIds = await scope.findUserIds(input.role, connection);
    }
    const page = await this.services.userQueries.list({
      page: input.page,
      pageSize: input.pageSize,
      search: input.search,
      status: input.status,
      userIds,
    });
    return {
      ...page,
      items: await this.withRoleScopesForUsers(page.items, connection),
    };
  }

  async create(input: CreateManagedUserInput): Promise<ManagedUser> {
    const submitted = input.roleScopes ?? {};
    this.validateCreateRoleScopes(submitted);
    let created: User | undefined;
    const postCommit = await committedDespite(() =>
      this.services.database.transaction(async (connection) => {
        const users = this.services.users.withConnection(connection);
        created = await users.create(input);
        await this.services.credentials
          .withConnection(connection)
          .createPasswordCredential(created.id, input.password);
        for (const [key, value] of Object.entries(submitted)) {
          await this.requireScope(key).replace(created.id, value, connection);
        }
      }),
    );
    if (!created) throw new Error('User creation did not return a user.');
    if (Object.keys(submitted).length > 0) {
      await this.services.onRoleScopesChanged?.(created.id);
    }
    if (postCommit) throw postCommit;
    return this.withRoleScopes(created, this.services.database.connection());
  }

  async update(
    userId: string,
    input: Parameters<UserManagementService['update']>[1],
  ) {
    const user = await this.services.database.transaction(
      async (connection) => {
        await lockUser(connection, userId);
        return this.services.users
          .withConnection(connection)
          .updateProfile(userId, input);
      },
    );
    return this.withRoleScopes(user, this.services.database.connection());
  }

  async disable(userId: string): Promise<ManagedUser> {
    // Protection and session revocation run as lifecycle handlers inside the
    // users plugin, in the same transaction as the status write.
    const user = await this.services.database.transaction(
      async (connection) => {
        await lockUser(connection, userId);
        return this.services.users.withConnection(connection).disable(userId);
      },
    );
    return this.withRoleScopes(user, this.services.database.connection());
  }

  async remove(userId: string, actorId: string): Promise<void> {
    this.services.lifecycle.assertDeletionReady();
    if (userId === actorId)
      throw new UserManagementError(
        'SELF_DELETE_NOT_ALLOWED',
        'You cannot delete your own account.',
        409,
      );
    // Operator eligibility, resource ownership, credential and API key cleanup
    // are lifecycle handlers; repeating a deletion finds no user and does nothing.
    const postCommit = await committedDespite(() =>
      this.services.database.transaction((connection) =>
        this.services.users.withConnection(connection).remove(userId, actorId),
      ),
    );
    await this.services.onRoleScopesChanged?.(userId);
    if (postCommit) throw postCommit;
  }

  async enable(userId: string): Promise<ManagedUser> {
    const user = await this.services.database.transaction(
      async (connection) => {
        await lockUser(connection, userId);
        return this.services.users.withConnection(connection).enable(userId);
      },
    );
    return this.withRoleScopes(user, this.services.database.connection());
  }

  async replaceRoleScope(
    userId: string,
    scopeKey: string,
    value: UserRoleValue,
  ): Promise<ManagedUser> {
    const scope = this.requireScope(scopeKey);
    this.validateRoleScopeValue(scope, value);
    const postCommit = await committedDespite(() =>
      this.services.database.transaction(async (connection) => {
        const user = await this.services.users
          .withConnection(connection)
          .get(userId);
        if (!user) {
          throw new UserManagementError(
            'USER_NOT_FOUND',
            `Unknown user: ${userId}`,
            404,
          );
        }
        await scope.replace(userId, value, connection);
      }),
    );
    await this.services.onRoleScopesChanged?.(userId);
    if (postCommit) throw postCommit;
    const user = await this.services.users.get(userId);
    if (!user) {
      throw new UserManagementError(
        'USER_NOT_FOUND',
        `Unknown user: ${userId}`,
        404,
      );
    }
    return this.withRoleScopes(user, this.services.database.connection());
  }

  async resetPassword(userId: string, password: string): Promise<void> {
    await this.services.database.transaction(async (connection) => {
      await lockUser(connection, userId);
      await this.services.credentials
        .withConnection(connection)
        .resetPassword(userId, password);
    });
  }

  revokeSessions(userId: string): Promise<void> {
    return this.services.credentials.revokeSessions(userId);
  }

  private validateCreateRoleScopes(
    submitted: Readonly<Record<string, UserRoleValue>>,
  ): void {
    for (const [key, value] of Object.entries(submitted)) {
      this.validateRoleScopeValue(this.requireScope(key), value);
    }
    for (const scope of this.services.roleScopes.list()) {
      const value = submitted[scope.key];
      if (
        scope.requiredOnCreate &&
        (value === undefined || roleValueIsEmpty(value))
      ) {
        throw new UserManagementError(
          'ROLE_SCOPE_REQUIRED',
          `Role scope "${scope.key}" is required when creating a user`,
        );
      }
    }
  }

  private validateRoleScopeValue(
    scope: UserRoleScope,
    value: UserRoleValue,
  ): void {
    const valid =
      scope.selection === 'single'
        ? typeof value === 'string' && value.trim().length > 0
        : typeof value !== 'string' &&
          value.every((role) => role.trim().length > 0) &&
          new Set(value).size === value.length;
    if (!valid) {
      throw new UserManagementError(
        'INVALID_ROLE_SCOPE_VALUE',
        `Role scope "${scope.key}" requires a ${scope.selection} selection`,
      );
    }
  }

  private requireScope(key: string): UserRoleScope {
    const scope = this.services.roleScopes.get(key);
    if (!scope) {
      throw new UserManagementError(
        'ROLE_SCOPE_NOT_FOUND',
        `Unknown user role scope: ${key}`,
        404,
      );
    }
    return scope;
  }

  private async withRoleScopes(
    user: User,
    connection: ReturnType<DatabaseManager['connection']>,
  ): Promise<ManagedUser> {
    const entries = await Promise.all(
      this.services.roleScopes
        .list()
        .map(
          async (scope) =>
            [scope.key, await scope.get(user.id, connection)] as const,
        ),
    );
    return { ...user, roleScopes: Object.fromEntries(entries) };
  }

  private async withRoleScopesForUsers(
    users: readonly User[],
    connection: ReturnType<DatabaseManager['connection']>,
  ): Promise<readonly ManagedUser[]> {
    const scopes = this.services.roleScopes.list();
    const valuesByScope = await Promise.all(
      scopes.map(async (scope) => {
        const values = scope.getMany
          ? await scope.getMany(
              users.map(({ id }) => id),
              connection,
            )
          : Object.fromEntries(
              await Promise.all(
                users.map(
                  async (user) =>
                    [user.id, await scope.get(user.id, connection)] as const,
                ),
              ),
            );
        return [scope, values] as const;
      }),
    );
    return users.map((user) => ({
      ...user,
      roleScopes: Object.fromEntries(
        valuesByScope.map(([scope, values]) => [
          scope.key,
          values[user.id] ?? (scope.selection === 'multiple' ? [] : ''),
        ]),
      ),
    }));
  }
}

/**
 * Runs a transaction and reports a post-commit failure instead of throwing
 * it, so the caller can still run its own follow-ups for a change that did
 * commit before surfacing the failure. Any other error propagates.
 */
async function committedDespite(
  run: () => Promise<void>,
): Promise<TransactionPostCommitError | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    if (error instanceof TransactionPostCommitError) return error;
    throw error;
  }
}

function roleValueIsEmpty(value: UserRoleValue): boolean {
  return typeof value === 'string'
    ? value.trim().length === 0
    : value.length === 0;
}
