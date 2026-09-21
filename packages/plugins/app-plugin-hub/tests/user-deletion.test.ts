import { createAuthMiddleware } from 'better-auth/api';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import {
  AUTHENTICATION_USER_LIFECYCLE_KEY,
  createAuthentication,
  createAuthenticationCredentialService,
  authenticationToken,
  type AuthenticationCredentialService,
} from '@nocobase/app-plugin-authentication';
import {
  UserLifecycleRegistry,
  UserService,
  userLifecycleToken,
} from '@nocobase/app-plugin-users/server';
import {
  createAppAuthorization,
  authorizationToken,
} from '@nocobase/app-plugin-authorization';
import { ApiKeyService } from '@nocobase/app-plugin-api-keys/server';
import {
  createPermissionSetProtectionHandler,
  createUserManagementService,
  createUserQueryService,
  createUserRoleScopeRegistry,
  userManagementServiceToken,
  userQueryServiceToken,
  userRoleScopeRegistryToken,
  type UserQueryService,
} from '@nocobase/app-plugin-user-management/server';
import { UsersProvider } from '../../app-plugin-user-management/server/providers/users.js';
import { apiRoutes } from '../../app-plugin-user-management/server/routes/index.js';
import { ServiceContainer } from '@nocobase/service-provider';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  createHubUserLifecycleHandler,
  createHubUserRoleScope,
  HUB_USER_LIFECYCLE_KEY,
  registerHubResources,
  protectHubPermissionSets,
} from '../server/authorization.js';
import {
  hubApiKeyAuthentication,
  HUB_API_KEY_CONFIG_ID,
} from '../server/api-key-auth.js';
import { HubApiKeyService } from '../server/services/api-keys.js';
import { DefaultHubService } from '../server/services/hub.js';
import deletePermissionMigration from '../database/migrations/202609170003_administrator_delete_users.js';

let db: DatabaseManager;
let auth: ReturnType<typeof createAuthentication>;
let authz: ReturnType<typeof createAppAuthorization>;
let management: ReturnType<typeof createUserManagementService>;
let users: UserService;
let queries: UserQueryService;
let credentials: AuthenticationCredentialService;
let keys: HubApiKeyService;
let roles: ReturnType<typeof createUserRoleScopeRegistry>;
let lifecycle: UserLifecycleRegistry;
let target: string;
let registered = false;
const secret = 'test-only-user-deletion-secret-at-least-32';
beforeEach(async () => {
  registered = false;
  db = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  for (const plugin of ['authentication', 'authorization', 'api-keys', 'hub']) {
    const directory = `../../app-plugin-${plugin}/database/migrations`;
    await createMigrator({
      database: db,
      packageName: `@nocobase/app-plugin-${plugin}`,
      directory: fileURLToPath(new URL(directory, import.meta.url)),
    }).latest();
  }
  // Wire the users lifecycle the way the providers do at boot: authentication
  // revokes sessions and accounts, User management protects Permission Sets,
  // Hub checks the operator and App ownership. The Hub template enables
  // deletion with exactly these participants.
  lifecycle = new UserLifecycleRegistry({
    enabled: true,
    requiredHandlers: [
      AUTHENTICATION_USER_LIFECYCLE_KEY,
      HUB_USER_LIFECYCLE_KEY,
    ],
  });
  auth = createAuthentication({
    connection: db.connection(),
    secret,
    baseURL: 'http://localhost:3000',
    plugins: hubApiKeyAuthentication(),
    userLifecycle: lifecycle,
  });
  users = new UserService(db.connection(), { lifecycle });
  queries = createUserQueryService(db.connection());
  credentials = createAuthenticationCredentialService({
    auth,
    connection: db.connection(),
  });
  lifecycle.register({
    key: AUTHENTICATION_USER_LIFECYCLE_KEY,
    order: -100,
    after: async (context) => {
      const scoped = credentials.withConnection(context.connection);
      if (context.operation === 'delete') {
        await scoped.deleteCredentials(context.userId);
      } else {
        await scoped.revokeSessions(context.userId);
      }
    },
  });
  authz = createAppAuthorization({ connection: db.connection() });
  registerHubResources(authz, db.connection());
  protectHubPermissionSets(authz.permissionSets);

  roles = createUserRoleScopeRegistry();
  roles.register(createHubUserRoleScope(authz.permissionSets));
  lifecycle.register(
    createPermissionSetProtectionHandler(authz.permissionSets),
  );
  lifecycle.register(createHubUserLifecycleHandler(authz.permissionSets));
  management = createUserManagementService({
    database: db,
    users,
    userQueries: queries,
    credentials,
    roleScopes: roles,
    lifecycle,
  });
  for (const id of ['admin', 'admin-two']) {
    await db
      .query()
      .insertInto('user')
      .values({
        id,
        name: id,
        email: `${id}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    await authz.permissionSets.assign({
      subject: { type: 'user', id },
      permissionSet: 'hub-administrator',
    });
  }
  target = (
    await management.create({
      name: 'Deletion target',
      username: 'delete.target',
      email: 'delete@example.com',
      password: 'test-password-123',
      roleScopes: { hub: 'hub-operator' },
    })
  ).id;
  await db
    .query()
    .insertInto('hubApps')
    .values({
      id: 'other-app',
      name: 'Other application',
      enabled: false,
      basePath: '/other-app',
      backend: 'in-process',
      startupMode: 'lazy',
      createdBy: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .execute();
  keys = new HubApiKeyService(
    db,
    authz,
    new ApiKeyService(auth, HUB_API_KEY_CONFIG_ID),
    secret,
  );
});
afterEach(async () => {
  await db.destroy();
});
async function router(actorId?: string) {
  const container = new ServiceContainer();
  const sessionAuth = createAuthentication({
    connection: db.connection(),
    secret,
    baseURL: 'http://localhost:3000',
    plugins: hubApiKeyAuthentication(),
  });
  if (actorId)
    vi.spyOn(sessionAuth, 'getSession').mockResolvedValue({
      user: {
        id: actorId,
        name: actorId,
        email: `${actorId}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: {
        id: 's',
        token: 'test',
        userId: actorId,
        expiresAt: new Date(Date.now() + 60000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  container.instance(userQueryServiceToken, queries);
  container.instance(userLifecycleToken, lifecycle);
  container.instance(authenticationToken, sessionAuth);
  container.instance(authorizationToken, authz);
  container.instance(userManagementServiceToken, management);
  container.instance(userRoleScopeRegistryToken, roles);
  if (!registered) {
    await new UsersProvider({ container } as AppPluginApplication).boot();
    registered = true;
  }
  return apiRoutes.createRouter({ container } as AppPluginApplication);
}
function deletion(confirm: unknown = true) {
  return {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirm }),
  };
}

describe('Hub user deletion', () => {
  it('requires a platform administrator, explicit confirmation, and disallows self deletion', async () => {
    expect(
      (await (await router()).request(`/users/${target}`, deletion())).status,
    ).toBe(401);
    expect(
      (await (await router(target)).request('/users/admin-two', deletion()))
        .status,
    ).toBe(403);
    const api = await router('admin');
    expect(
      (await api.request(`/users/${target}`, deletion(false))).status,
    ).toBe(400);
    const self = await api.request('/users/admin', deletion());
    expect(self.status).toBe(409);
    expect(await self.json()).toMatchObject({
      code: 'SELF_DELETE_NOT_ALLOWED',
    });
    expect(await users.get(target)).toBeDefined();
  });
  it('blocks users with Apps and retains all data', async () => {
    await db
      .query()
      .updateTable('hubApps')
      .set({ createdBy: target })
      .where('id', '=', 'other-app')
      .execute();
    await expect(management.remove(target, 'admin')).rejects.toMatchObject({
      code: 'USER_HAS_APPS',
    });
    expect(await users.get(target)).toBeDefined();
    expect(
      await db.query().selectFrom('hubApps').selectAll().execute(),
    ).toHaveLength(1);
  });
  it('protects the last enabled administrator even when the other administrator is disabled', async () => {
    await router('admin');
    await db
      .query()
      .updateTable('user')
      .set({ disabledAt: new Date() })
      .where('id', '=', 'admin-two')
      .execute();
    await expect(management.disable('admin')).rejects.toMatchObject({
      name: 'PermissionSetLastAssignmentError',
    });
    await expect(management.remove('admin', 'admin-two')).rejects.toMatchObject(
      { code: 'HUB_ADMIN_REQUIRED' },
    );
  });
  it('removes access atomically, hides the user, and preserves historical identity and other Apps', async () => {
    await authz.permissionSets.replaceSubjectAssignments({
      subject: { type: 'user', id: target },
      managedPermissionSets: ['hub-administrator', 'hub-operator'],
      permissionSets: ['hub-administrator'],
    });
    const publishing = await keys.create(target, {
      name: 'Foreign App Key',
      appIds: ['other-app'],
      scopes: ['deploy'],
    });
    const normal = new ApiKeyService(auth, 'default');
    const generic = await normal.create({ userId: target, name: 'Normal key' });
    const ctx = await auth.credentialContext();
    const session = await ctx.internalAdapter.createSession(target);
    expect(await ctx.internalAdapter.findSession(session.token)).not.toBeNull();
    const before = await db.query().selectFrom('hubApps').selectAll().execute();
    const api = await router('admin');
    expect((await api.request(`/users/${target}`, deletion())).status).toBe(
      200,
    );
    expect((await api.request(`/users/${target}`, deletion())).status).toBe(
      200,
    );
    expect(await users.get(target)).toBeUndefined();
    expect((await queries.list({ search: 'Deletion target' })).total).toBe(0);
    const tombstone = await db
      .query()
      .selectFrom('user')
      .selectAll()
      .where('id', '=', target)
      .executeTakeFirstOrThrow();
    expect(tombstone).toMatchObject({
      name: 'Deletion target',
      deletedBy: 'admin',
    });
    expect(tombstone.deletedAt).not.toBeNull();
    expect(tombstone.disabledAt).not.toBeNull();
    expect(
      await db
        .query()
        .selectFrom('session')
        .selectAll()
        .where('userId', '=', target)
        .execute(),
    ).toEqual([]);
    expect(
      await db
        .query()
        .selectFrom('account')
        .selectAll()
        .where('userId', '=', target)
        .execute(),
    ).toEqual([]);
    expect(
      await db
        .query()
        .selectFrom('apikey')
        .selectAll()
        .where('referenceId', '=', target)
        .execute(),
    ).toEqual([]);
    expect(
      await db
        .query()
        .selectFrom('hubApiKeys')
        .selectAll()
        .where('id', '=', publishing.key.id)
        .execute(),
    ).toEqual([]);
    expect(
      await db
        .query()
        .selectFrom('hubApiKeyApps')
        .selectAll()
        .where('keyId', '=', publishing.key.id)
        .execute(),
    ).toEqual([]);
    expect(await normal.verify(generic.secret)).toBeNull();
    await expect(
      keys.verify(publishing.secret, 'other-app', 'deploy'),
    ).rejects.toMatchObject({ status: 401 });
    expect(await ctx.internalAdapter.findSession(session.token)).toBeNull();
    await expect(users.enable(target)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
    expect(
      await db.query().selectFrom('hubApps').selectAll().execute(),
    ).toEqual(before);
    await expect(
      keys.create(target, {
        name: 'New',
        allApps: true,
        appIds: [],
        scopes: ['deploy'],
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('revokes a login that was already in flight when the user was deleted', async () => {
    const gated = createAuthentication({
      connection: db.connection(),
      secret,
      baseURL: 'http://localhost:3000',
      plugins: hubApiKeyAuthentication(),
      databaseHooks: {
        session: {
          create: {
            after: async () => {
              await management.remove(target, 'admin');
            },
          },
        },
      },
    });
    const ctx = await gated.credentialContext();
    await expect(
      ctx.internalAdapter.createSession(target),
    ).rejects.toMatchObject({ body: { code: 'ACCOUNT_DISABLED' } });
    expect(
      await db
        .query()
        .selectFrom('session')
        .select('id')
        .where('userId', '=', target)
        .execute(),
    ).toEqual([]);
  });
  it('rejects a generic API key request that completes after its owner is deleted', async () => {
    const gated = createAuthentication({
      connection: db.connection(),
      secret,
      baseURL: 'http://localhost:3000',
      plugins: hubApiKeyAuthentication(),
      hooks: {
        before: createAuthMiddleware(async (ctx) => {
          if (ctx.path === '/api-key/create')
            await management.remove(target, 'admin');
        }),
      },
    });
    await expect(
      new ApiKeyService(gated, 'default').create({
        userId: target,
        name: 'Late key',
      }),
    ).rejects.toMatchObject({ body: { code: 'ACCOUNT_DISABLED' } });
    expect(
      await db
        .query()
        .selectFrom('apikey')
        .select('id')
        .where('referenceId', '=', target)
        .execute(),
    ).toEqual([]);
  });
  it('does not reactivate a deleted user when enable and deletion overlap', async () => {
    await Promise.allSettled([
      management.remove(target, 'admin'),
      management.enable(target),
    ]);
    expect(await users.get(target)).toBeUndefined();
    const row = await db
      .query()
      .selectFrom('user')
      .select(['deletedAt', 'disabledAt'])
      .where('id', '=', target)
      .executeTakeFirstOrThrow();
    expect(row.deletedAt).not.toBeNull();
    expect(row.disabledAt).not.toBeNull();
    await expect(
      management.resetPassword(target, 'new-password-123'),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
    expect(
      await db
        .query()
        .selectFrom('account')
        .select('id')
        .where('userId', '=', target)
        .execute(),
    ).toEqual([]);
  });
  it('rolls back credential removal when a later lifecycle hook fails', async () => {
    const normal = new ApiKeyService(auth, 'default');
    const key = await normal.create({ userId: target, name: 'Keep' });
    lifecycle.register({
      key: 'failing',
      order: 100,
      after: async () => {
        throw new Error('cleanup failed');
      },
    });
    await expect(management.remove(target, 'admin')).rejects.toThrow(
      'cleanup failed',
    );
    expect(await users.get(target)).toBeDefined();
    expect(await normal.verify(key.secret)).not.toBeNull();
  });
  it('prevents creating an App for a deleted owner', async () => {
    await management.remove(target, 'admin');
    const hub = new DefaultHubService({
      database: db,
      hostController: {} as never,
      config: {
        artifact: {
          driver: 'fs',
          location: '/private/tmp/hub-user-deletion-artifacts',
          visibility: 'private',
        },
        host: { enabled: false },
      } as never,
    });
    await expect(
      hub.createApp({ id: 'orphan', name: 'Orphan' }, target),
    ).rejects.toMatchObject({ code: 'APP_OWNER_UNAVAILABLE' });
    expect(
      await db
        .query()
        .selectFrom('hubApps')
        .select('id')
        .where('id', '=', 'orphan')
        .execute(),
    ).toEqual([]);
  });
  it('preserves an active administrator when two administrators try to delete each other', async () => {
    await db
      .query()
      .updateTable('hubApps')
      .set({ createdBy: target })
      .where('id', '=', 'other-app')
      .execute();
    const results = await Promise.allSettled([
      management.remove('admin', 'admin-two'),
      management.remove('admin-two', 'admin'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await db
        .query()
        .selectFrom('user')
        .select('id')
        .where('id', 'in', ['admin', 'admin-two'])
        .where('disabledAt', 'is', null)
        .execute(),
    ).toHaveLength(1);
  });
  it('converges the delete grant without changing unrelated grants or assignments', async () => {
    const before = await db
      .query()
      .selectFrom('authorizationPermissionSets')
      .selectAll()
      .execute();
    await db.transaction((connection) =>
      deletePermissionMigration.up(connection),
    );
    await db.transaction((connection) =>
      deletePermissionMigration.up(connection),
    );
    expect(
      await db
        .query()
        .selectFrom('authorizationPermissionSets')
        .selectAll()
        .execute(),
    ).toEqual(before);
  });
});
