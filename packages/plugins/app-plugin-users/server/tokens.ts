import type { DatabaseConnection } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type {
  AdministratedUser,
  CreateAdministratedUserInput,
  UpdateAdministratedUserInput,
} from '@nocobase/app-plugin-authentication';

export type UserRoleSelection = 'single' | 'multiple';
export type UserRoleValue = string | readonly string[];

export interface UserRoleOption {
  readonly value: string;
  readonly label: string;
  readonly labelI18nKey?: string;
  readonly labelI18nNs?: string;
  readonly description?: string;
  /** Defaults to true. Set to false for assignments that this scope may show but not add. */
  readonly assignable?: boolean;
  /** Defaults to true. Set to false for protected assignments that this scope may not revoke. */
  readonly removable?: boolean;
}

export interface UserRoleScope {
  readonly key: string;
  readonly label: string;
  readonly labelI18nKey?: string;
  readonly labelI18nNs?: string;
  readonly selection: UserRoleSelection;
  readonly requiredOnCreate?: boolean;
  /** The scope shows direct roles while authenticated-subject permissions apply separately. */
  readonly hasAuthenticatedDefaultAccess?: boolean;
  options(): Promise<readonly UserRoleOption[]>;
  get(userId: string, connection: DatabaseConnection): Promise<UserRoleValue>;
  getMany?(
    userIds: readonly string[],
    connection: DatabaseConnection,
  ): Promise<Readonly<Record<string, UserRoleValue>>>;
  findUserIds(
    role: string,
    connection: DatabaseConnection,
  ): Promise<readonly string[]>;
  replace(
    userId: string,
    value: UserRoleValue,
    connection: DatabaseConnection,
  ): Promise<void>;
  assertCanDisable?(
    userId: string,
    connection: DatabaseConnection,
  ): Promise<void>;
}

export interface UserRoleScopeRegistry {
  register(scope: UserRoleScope): () => void;
  get(key: string): UserRoleScope | undefined;
  list(): readonly UserRoleScope[];
}

export interface ManagedUser extends AdministratedUser {
  readonly roleScopes: Readonly<Record<string, UserRoleValue>>;
}

export interface ManagedUserPage {
  readonly items: readonly ManagedUser[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface UserManagementOptions {
  readonly roleScopes: readonly {
    key: string;
    label: string;
    labelI18nKey?: string;
    labelI18nNs?: string;
    selection: UserRoleSelection;
    requiredOnCreate: boolean;
    hasAuthenticatedDefaultAccess: boolean;
    options: readonly UserRoleOption[];
  }[];
}

export interface ListManagedUsersInput {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly status?: 'enabled' | 'disabled';
  readonly roleScope?: string;
  readonly role?: string;
}

export interface CreateManagedUserInput extends CreateAdministratedUserInput {
  readonly roleScopes?: Readonly<Record<string, UserRoleValue>>;
}

export interface UserManagementService {
  options(): Promise<UserManagementOptions>;
  list(input?: ListManagedUsersInput): Promise<ManagedUserPage>;
  create(input: CreateManagedUserInput): Promise<ManagedUser>;
  update(
    userId: string,
    input: UpdateAdministratedUserInput,
  ): Promise<ManagedUser>;
  disable(userId: string): Promise<ManagedUser>;
  enable(userId: string): Promise<ManagedUser>;
  replaceRoleScope(
    userId: string,
    scope: string,
    value: UserRoleValue,
  ): Promise<ManagedUser>;
  resetPassword(userId: string, password: string): Promise<void>;
  revokeSessions(userId: string): Promise<void>;
}

export class UserManagementError extends Error {
  constructor(
    readonly code:
      | 'USER_NOT_FOUND'
      | 'ROLE_SCOPE_NOT_FOUND'
      | 'ROLE_SCOPE_REQUIRED'
      | 'INVALID_ROLE_SCOPE_VALUE',
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = 'UserManagementError';
  }
}

/** An application-defined role scope can reject a user-management operation. */
export class UserRoleScopeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = 'UserRoleScopeError';
  }
}

export const userRoleScopeRegistryToken: ServiceToken<UserRoleScopeRegistry> =
  createServiceToken<UserRoleScopeRegistry>(
    '@nocobase/app-plugin-users/role-scopes',
  );

export const userManagementServiceToken: ServiceToken<UserManagementService> =
  createServiceToken<UserManagementService>(
    '@nocobase/app-plugin-users/service',
  );
