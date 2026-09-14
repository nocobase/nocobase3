import type { DatabaseConnection } from '@nocobase/db';
import {
  createAuthorization,
  type Authorization,
  type AuthorizationPlugin,
} from '@nocobase/authorization/core';
import type { DatabaseAuthorizationApi } from './database/index.js';
import {
  permissionSets,
  type PermissionSetsAuthorizationApi,
  type PermissionSetsPlugin,
} from '@nocobase/authorization/permissions';
import { DatabaseConnectionHandle } from './stores/connection.js';
import { DatabasePermissionSetStore } from './stores/permission-sets.js';

export interface AppPermissionSetsConfig {
  /** The Permission Set that confers unrestricted access. */
  rootSet?: string;
  /** The Permission Set every signed-in user holds. */
  defaultSet?: string;
}

export interface AuthorizationConfig {
  permissionSets?: AppPermissionSetsConfig;
  /** Plugins the application chooses to install; Permission Sets is not among them. */
  plugins?: readonly AuthorizationPlugin[];
}

const DEFAULT_ROOT_SET = 'root';
const DEFAULT_DEFAULT_SET = 'member';

interface AuthSessionUser {
  id: string;
}

interface AuthSession {
  user: AuthSessionUser;
}

export interface CreateAppAuthorizationOptions {
  connection?: DatabaseConnection;
  onUserPermissionsChanged?(userId: string): void | Promise<void>;
  onAuthenticatedPermissionsChanged?(): void | Promise<void>;
  config?: AuthorizationConfig;
}

export function createAppAuthorization(
  options: CreateAppAuthorizationOptions,
): Authorization & PermissionSetsAuthorizationApi<DatabaseConnection> {
  const sets = options.config?.permissionSets;
  const connection = new DatabaseConnectionHandle(
    'Permission Sets',
    options.connection,
  );
  // Permission Sets leads the tuple so the api is inferred rather than asserted.
  const plugins: readonly [
    PermissionSetsPlugin<DatabaseConnection>,
    ...AuthorizationPlugin[],
  ] = [
    permissionSets<DatabaseConnection>({
      store: new DatabasePermissionSetStore(connection.resolve),
      rootSet: {
        key: sets?.rootSet ?? DEFAULT_ROOT_SET,
        // The identity middleware below makes `user` this host's principal
        // type: a superuser is an account, never an audience or a group.
        assignableTo: ['user'],
      },
      defaultSet: sets?.defaultSet ?? DEFAULT_DEFAULT_SET,
    }),
    ...(options.config?.plugins ?? []),
  ];
  const authz = createAuthorization({
    connection: options.connection,
    plugins,
  });
  authz.use(async (request, next) => {
    const session = readAuthSession(request.http.var.auth);
    request.principal = { type: 'user', id: session.user.id };
    request.subjects.add({ type: 'authenticated', id: '*' });
    await next();
  });
  authz.onGrantsChanged(async (subject) => {
    if (subject.type === 'user') {
      await options.onUserPermissionsChanged?.(subject.id);
    } else if (subject.type === 'authenticated') {
      await options.onAuthenticatedPermissionsChanged?.();
    }
  });
  return authz;
}

/**
 * The database plugin's api, or `undefined` when the application chose not to
 * install `databaseAuthorization`. The member is not part of `Authorization`,
 * so reaching it is a question the application answers at runtime.
 */
export function appAuthorizationDatabase(
  authz: Authorization,
): DatabaseAuthorizationApi['database'] | undefined {
  const api: unknown = Reflect.get(authz, 'database');
  return isDatabaseApi(api) ? api : undefined;
}

function isDatabaseApi(
  value: unknown,
): value is DatabaseAuthorizationApi['database'] {
  return isRecord(value) && 'collections' in value && 'recordAccess' in value;
}

function readAuthSession(value: unknown): AuthSession {
  if (!isRecord(value) || !isRecord(value.user)) {
    throw new Error('Authorization requires an authenticated session');
  }
  const id = value.user.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Authorization session user must have an id');
  }
  return { user: { id } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
