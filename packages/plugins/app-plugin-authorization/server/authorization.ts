import { settingsApi } from './management/settings-resource.js';
import { installPermissionSetAdministration } from './management/authorization.js';
import './subjects.js';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createAuthorization,
  type Authorization,
  type AuthorizationPlugin,
} from '@nocobase/authorization/core';
import {
  databaseAuthorization,
  type DatabaseAuthorizationApi,
  type DatabaseAuthorizationPlugin,
} from './database/index.js';
import {
  permissionSets,
  type PermissionSetsAuthorizationApi,
  type PermissionSetsPlugin,
} from '@nocobase/authorization/permissions';
import {
  pages,
  type PagesApi,
  type PagesPlugin,
} from './pages-authorization.js';
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
  /**
   * Plugins the application chooses to install. Permission Sets, page and database
   * authorization are built in and are not among them.
   */
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
  database?: DatabaseManager;
  connection?: DatabaseConnection;
  onUserPermissionsChanged?(userId: string): void | Promise<void>;
  onAuthenticatedPermissionsChanged?(): void | Promise<void>;
  config?: AuthorizationConfig;
}

export function createAppAuthorization(
  options: CreateAppAuthorizationOptions,
): Authorization &
  PermissionSetsAuthorizationApi<DatabaseConnection> &
  DatabaseAuthorizationApi & {
    pages: PagesApi;
  } {
  const sets = options.config?.permissionSets;
  const database = databaseAuthorization(options.database);
  const connection = new DatabaseConnectionHandle(
    'Permission Sets',
    options.connection,
  );
  const permissionSetPlugin = permissionSets<DatabaseConnection>({
    store: new DatabasePermissionSetStore(connection.resolve),
    rootSet: {
      key: sets?.rootSet ?? DEFAULT_ROOT_SET,
      // The identity middleware below makes `user` this host's principal
      // type: a superuser is an account, never an audience or a group.
      assignableTo: ['user'],
    },
    defaultSet: sets?.defaultSet ?? DEFAULT_DEFAULT_SET,
  });
  // The built-in plugins lead the tuple so their apis are inferred rather
  // than asserted: `authz.permissionSets`, `authz.db` and `authz.pages` are statically typed.
  const plugins: readonly [
    PermissionSetsPlugin<DatabaseConnection>,
    DatabaseAuthorizationPlugin,
    PagesPlugin,
    ...AuthorizationPlugin[],
  ] = [
    {
      ...permissionSetPlugin,
      setup(authz) {
        permissionSetPlugin.setup?.(authz);
        installPermissionSetAdministration(
          authz,
          permissionSetPlugin.authorizationApi!.permissionSets,
        );
      },
    },
    database,
    pages(),
    ...(options.config?.plugins ?? []),
  ];
  const authz = createAuthorization({
    connection: options.connection,
    plugins,
  });
  authz.subjects.define('authenticated', {
    filterActive: async (ids) => ids.filter((id) => id === '*'),
    administration: {
      title: { key: 'options.subjectTypes.authenticated' },
      selection: { type: 'fixed', id: '*' },
    },
  });
  authz.use(async (request, next) => {
    const session = readAuthSession(request.http.var.auth);
    request.principal = { type: 'user', id: session.user.id };
    request.subjects.add({ type: 'authenticated', id: '*' });
    for (const subject of await authz.subjects.resolveFor(request.principal))
      request.subjects.add(subject);
    await next();
  });
  authz.onGrantsChanged(async (subject) => {
    if (subject.type === 'user') {
      await options.onUserPermissionsChanged?.(subject.id);
    } else if (subject.type === 'authenticated') {
      await options.onAuthenticatedPermissionsChanged?.();
    }
  });
  database.authorizationApi.db.installInto(authz);
  Object.assign(authz, { settings: settingsApi });
  return authz;
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
