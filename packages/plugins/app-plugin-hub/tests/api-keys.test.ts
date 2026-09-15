import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { Knex } from 'knex';
import { ApiKeyService } from '@nocobase/app-plugin-api-keys/server';
import {
  hubApiKeyAuthentication,
  HUB_API_KEY_CONFIG_ID,
} from '../server/api-key-auth.js';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import {
  createAppAuthorization,
  authorizationToken,
} from '@nocobase/app-plugin-authorization';
import {
  authenticationToken,
  createAuthentication,
} from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceContainer } from '@nocobase/service-provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerHubResources } from '../server/authorization.js';
import {
  HubApiKeyService,
  hubApiKeyServiceToken,
} from '../server/services/api-keys.js';
import { hubServiceToken, type HubService } from '../server/tokens.js';
import { apiRoutes } from '../server/routes/index.js';
import migration from '../database/migrations/202609150002_create_hub_app_api_keys.js';

let db: DatabaseManager;
let authz: ReturnType<typeof createAppAuthorization>;
let service: HubApiKeyService;
let authentication: ReturnType<typeof createAuthentication>;
let keyService: ApiKeyService;
async function migrate(packageName: string, directory: string) {
  return createMigrator({
    database: db,
    packageName,
    directory: fileURLToPath(new URL(directory, import.meta.url)),
  }).latest();
}
beforeEach(async () => {
  db = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  await migrate(
    '@nocobase/app-plugin-authentication',
    '../../app-plugin-authentication/database/migrations',
  );
  await migrate(
    '@nocobase/app-plugin-authorization',
    '../../app-plugin-authorization/database/migrations',
  );
  await migrate(
    '@nocobase/app-plugin-api-keys',
    '../../app-plugin-api-keys/database/migrations',
  );
  await migrate('@nocobase/app-plugin-hub', '../database/migrations');
  authz = createAppAuthorization({ connection: db.connection() });
  registerHubResources(authz);
  const now = new Date();
  for (const id of ['admin', 'operator', 'viewer']) {
    await db
      .connection()
      .query.insertInto('user')
      .values({
        id,
        name: id,
        email: `${id}@example.com`,
        username: id,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
        disabledAt: null,
      })
      .execute();
    await authz.permissionSets.assign({
      subject: { type: 'user', id },
      permissionSet: id === 'admin' ? 'hub-administrator' : `hub-${id}`,
    });
  }
  for (const id of ['crm', 'erp'])
    await db
      .connection()
      .query.insertInto('hubApps')
      .values({
        id,
        name: id,
        enabled: false,
        basePath: `/${id}`,
        backend: 'in-process',
        startupMode: 'lazy',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  authentication = createAuthentication({
    connection: db.connection(),
    secret: 'test-only-auth-secret-at-least-32-characters',
    baseURL: 'http://localhost:3000',
    plugins: hubApiKeyAuthentication(),
  });
  keyService = new ApiKeyService(authentication, HUB_API_KEY_CONFIG_ID);
  service = new HubApiKeyService(db, authz, keyService);
});
afterEach(async () => {
  await db.destroy();
});
const create = () =>
  service.create('crm', 'admin', {
    name: 'CI',
    scopes: ['upload-release', 'read-release'],
  });

describe('Hub publishing key lifecycle and permissions', () => {
  it('rolls back the plugin credential when the Hub binding insert fails', async () => {
    const client = await db.connection().client<Knex>();
    await client.raw(
      "CREATE TRIGGER fail_hub_key_binding BEFORE INSERT ON hub_app_api_keys BEGIN SELECT RAISE(ABORT, 'Binding rejected'); END",
    );
    await expect(create()).rejects.toThrow('Binding rejected');
    expect(
      await db.connection().query.selectFrom('apikey').select('id').execute(),
    ).toEqual([]);
    expect(
      await db
        .connection()
        .query.selectFrom('hubAppApiKeys')
        .select('id')
        .execute(),
    ).toEqual([]);
    await client.raw('DROP TRIGGER fail_hub_key_binding');
    await create();
    expect(await service.list('crm', 'admin')).toHaveLength(1);
  });

  it('rolls back credential disable when updating the Hub binding fails', async () => {
    const { key, secret } = await create();
    const client = await db.connection().client<Knex>();
    await client.raw(
      "CREATE TRIGGER fail_hub_key_disable BEFORE UPDATE OF disabled_at ON hub_app_api_keys BEGIN SELECT RAISE(ABORT, 'Disable rejected'); END",
    );
    await expect(service.disable('crm', key.id, 'admin')).rejects.toThrow(
      'Disable rejected',
    );
    expect((await keyService.get(key.id))?.enabled).toBe(true);
    expect((await service.list('crm', 'admin'))[0]?.status).toBe('active');
    await client.raw('DROP TRIGGER fail_hub_key_disable');
    await service.disable('crm', key.id, 'admin');
    expect(await keyService.verify(secret)).toBeNull();
  });

  it('stores only a hash, lists summaries and records use', async () => {
    const { key, secret } = await create();
    expect(secret).toMatch(/^hub_app_[A-Za-z0-9_-]+$/);
    const row = await db
      .connection()
      .query.selectFrom('apikey')
      .selectAll()
      .executeTakeFirst();
    expect(row?.key).toBe(
      createHash('sha256').update(secret).digest('base64url'),
    );
    expect(JSON.stringify(row)).not.toContain(secret);
    const binding = await db
      .connection()
      .query.selectFrom('hubAppApiKeys')
      .selectAll()
      .where('id', '=', key.id)
      .executeTakeFirst();
    expect(binding).not.toHaveProperty('secretHash');
    expect(binding).not.toHaveProperty('key');
    expect(key.status).toBe('active');
    expect(await service.verify(secret, 'crm', 'read-release')).toMatchObject({
      id: key.id,
      createdBy: 'admin',
    });
    const list = await service.list('crm', 'admin');
    expect(list[0]?.lastUsedAt).not.toBeNull();
    expect(list[0]?.creatorName).toBe('admin');
    expect(JSON.stringify(list)).not.toContain(secret);
    expect(list[0]).not.toHaveProperty('secretHash');
  });
  it('denies cross-app usage, missing scopes, invalid keys and cross-app mutation', async () => {
    const { key, secret } = await create();
    await expect(
      service.verify(secret, 'erp', 'read-release'),
    ).rejects.toMatchObject({ status: 403 });
    await expect(service.verify(secret, 'crm', 'deploy')).rejects.toMatchObject(
      { status: 403 },
    );
    await expect(
      service.verify(`${secret}x`, 'crm', 'read-release'),
    ).rejects.toMatchObject({ status: 401 });
    await expect(service.disable('erp', key.id, 'admin')).rejects.toMatchObject(
      { status: 404 },
    );
    await service.remove('erp', key.id, 'admin');
    await expect(
      service.verify(secret, 'crm', 'read-release'),
    ).resolves.toMatchObject({ id: key.id });
  });
  it('makes disable and deletion repeatable and immediately effective', async () => {
    const { key, secret } = await create();
    await service.disable('crm', key.id, 'admin');
    await service.disable('crm', key.id, 'admin');
    await expect(
      service.verify(secret, 'crm', 'read-release'),
    ).rejects.toMatchObject({ status: 401 });
    expect((await service.list('crm', 'admin'))[0]?.status).toBe('disabled');
    await service.remove('crm', key.id, 'admin');
    await service.remove('crm', key.id, 'admin');
    expect(await service.list('crm', 'admin')).toEqual([]);
    await expect(
      service.verify(secret, 'crm', 'read-release'),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('rejects expired keys and malformed creation requests', async () => {
    for (const input of [
      { name: '', scopes: ['deploy'] },
      { name: 'CI', scopes: [] },
      { name: 'CI', scopes: ['remove'] },
      { name: 'CI', scopes: ['deploy'], expiresAt: 'bad' },
      { name: 'CI', scopes: ['deploy'], expiresAt: '2000-01-01' },
    ]) {
      await expect(
        service.create(
          'crm',
          'admin',
          input as Parameters<HubApiKeyService['create']>[2],
        ),
      ).rejects.toMatchObject({ status: 400 });
    }
    const { key, secret } = await create();
    await db
      .connection()
      .query.updateTable('apikey')
      .set({ expiresAt: new Date(0) })
      .where('id', '=', key.id)
      .execute();
    expect((await service.list('crm', 'admin'))[0]?.status).toBe('expired');
    await expect(
      service.verify(secret, 'crm', 'read-release'),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('allows only administrators to manage keys and cannot grant missing owner permissions', async () => {
    for (const user of ['operator', 'viewer']) {
      await expect(
        service.create('crm', user, { name: 'CI', scopes: ['deploy'] }),
      ).rejects.toThrow();
      await expect(service.list('crm', user)).rejects.toThrow();
    }
    await authz.permissionSets.create({
      key: 'key-manager',
      grants: [
        {
          resource: { type: 'hub.app', id: 'crm' },
          actions: [{ action: 'manage-api-keys' }],
        },
      ],
    });
    await authz.permissionSets.assign({
      subject: { type: 'user', id: 'viewer' },
      permissionSet: 'key-manager',
    });
    await expect(
      service.create('crm', 'viewer', { name: 'CI', scopes: ['deploy'] }),
    ).rejects.toThrow();
    await expect(
      service.create('crm', 'viewer', { name: 'CI', scopes: ['read-release'] }),
    ).resolves.toHaveProperty('secret');
  });
  it('rechecks the owner and removes keys when an App is deleted', async () => {
    const { secret } = await create();
    await db
      .connection()
      .query.updateTable('user')
      .set({ disabledAt: new Date() })
      .where('id', '=', 'admin')
      .execute();
    await expect(
      service.verify(secret, 'crm', 'read-release'),
    ).rejects.toMatchObject({ status: 401 });
    await db
      .connection()
      .query.updateTable('user')
      .set({ disabledAt: null })
      .where('id', '=', 'admin')
      .execute();
    await authz.permissionSets.replaceSubjectAssignments({
      subject: { type: 'user', id: 'admin' },
      managedPermissionSets: ['hub-administrator', 'hub-viewer'],
      permissionSets: ['hub-viewer'],
    });
    await expect(
      service.verify(secret, 'crm', 'upload-release'),
    ).rejects.toThrow();
    await service.removeAppKeys('crm');
    await service.removeAppKeys('crm');
    expect(await keyService.verify(secret)).toBeNull();
    await db
      .connection()
      .query.deleteFrom('hubApps')
      .where('id', '=', 'crm')
      .execute();
    expect(
      await db
        .connection()
        .query.selectFrom('hubAppApiKeys')
        .select('id')
        .execute(),
    ).toEqual([]);
  });
  it('migrates through the ledger twice and reverses only its own permission', async () => {
    await migrate('@nocobase/app-plugin-hub', '../database/migrations');
    const admin = await authz.permissionSets.list();
    expect(
      admin
        .find((r) => r.key === 'hub-administrator')
        ?.grants.flatMap((g) => g.actions.map((a) => a.action))
        .filter((a) => a === 'manage-api-keys'),
    ).toHaveLength(1);
    const connection = db.connection();
    await migration.down?.({
      connection,
      query: connection.query,
      builder: connection.builder,
    });
    const row = await connection.query
      .selectFrom('authorizationPermissionSets')
      .select('grants')
      .where('key', '=', 'hub-administrator')
      .executeTakeFirst();
    expect(JSON.stringify(row)).not.toContain('manage-api-keys');
    expect(JSON.stringify(row)).toContain('upload-release');
    await migration.up({
      connection,
      query: connection.query,
      builder: connection.builder,
    });
    expect(await service.list('crm', 'admin')).toEqual([]);
  });
});

describe('Hub API Key HTTP boundary', () => {
  async function router(userId?: string) {
    const container = new ServiceContainer();
    container.instance(
      authenticationToken,
      createAuthentication({
        connection: db.connection(),
        secret: 'test-only-auth-secret-at-least-32-characters',
        plugins: hubApiKeyAuthentication(),
      }),
    );
    if (userId) {
      const now = new Date();
      vi.spyOn(
        container.resolve(authenticationToken),
        'getSession',
      ).mockResolvedValue({
        user: {
          id: userId,
          name: userId,
          email: `${userId}@example.com`,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
        session: {
          id: 'session',
          token: 'test-session-token',
          userId,
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
    }
    container.instance(authorizationToken, authz);
    container.instance(hubApiKeyServiceToken, service);
    const listReleases = vi
      .fn<HubService['listReleases']>()
      .mockResolvedValue([]);
    container.instance(hubServiceToken, {
      listReleases,
    } as unknown as HubService);
    return {
      router: await apiRoutes.createRouter({
        container,
      } as AppPluginApplication),
      listReleases,
    };
  }
  it('enforces management ACL and returns one-time credentials with no-store', async () => {
    const { router: viewer } = await router('viewer');
    expect((await viewer.request('/hub/apps/crm/api-keys')).status).toBe(403);
    const { router: admin } = await router('admin');
    const response = await admin.request('/hub/apps/crm/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'CI', scopes: ['read-release'] }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const created = (await response.json()) as {
      data: { key: { id: string }; secret: string };
    };
    const list = await admin.request('/hub/apps/crm/api-keys');
    expect(list.headers.get('cache-control')).toBe('no-store');
    expect(await list.text()).not.toContain(created.data.secret);
    expect(
      (
        await admin.request(
          `/hub/apps/crm/api-keys/${created.data.key.id}/disable`,
          { method: 'POST' },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await admin.request(`/hub/apps/crm/api-keys/${created.data.key.id}`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(200);
    expect(await service.list('crm', 'admin')).toEqual([]);
  });
  it('accepts a scoped key without a Session, rejects non-publishing endpoints and ignores cookie fallback', async () => {
    const { secret } = await create();
    const { router: api, listReleases } = await router();
    expect((await api.request('/hub/apps/crm/releases')).status).toBe(401);
    const headers = { authorization: `Bearer ${secret}` };
    expect(
      (await api.request('/hub/apps/crm/releases', { headers })).status,
    ).toBe(200);
    expect(listReleases).toHaveBeenCalledWith('crm');
    expect(
      (await api.request('/hub/apps/erp/releases', { headers })).status,
    ).toBe(403);
    for (const path of [
      '/hub/apps',
      '/hub/apps/crm/config',
      '/hub/apps/crm/api-keys',
      '/hub/apps/crm/releases/id/config-template',
    ])
      expect((await api.request(path, { headers })).status).toBe(403);
    expect(
      (
        await api.request('/hub/apps/crm/deploy', {
          headers,
          method: 'POST',
          body: '{}',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api.request('/hub/apps/crm/api-keys', {
          headers: { 'x-api-key': secret },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await api.request('/hub/apps/crm/releases', {
          headers: { authorization: 'Bearer bad', cookie: 'fake=session' },
        })
      ).status,
    ).toBe(401);
    const key = (await service.list('crm', 'admin'))[0]!;
    await service.disable('crm', key.id, 'admin');
    expect(
      (await api.request('/hub/apps/crm/releases', { headers })).status,
    ).toBe(401);
  });
});

describe('Hub publishing configuration isolation', () => {
  it('cannot turn a publishing key into a user session or use a normal key for publishing', async () => {
    const { secret } = await create();
    await expect(
      authentication.getSession(new Headers({ 'x-api-key': secret })),
    ).rejects.toThrow();
    expect(
      await authentication.getSession(
        new Headers({ authorization: `Bearer ${secret}` }),
      ),
    ).toBeNull();
    const normal = await new ApiKeyService(authentication, 'default').create({
      userId: 'admin',
      name: 'User key',
    });
    expect(
      (
        await authentication.getSession(
          new Headers({ 'x-api-key': normal.secret }),
        )
      )?.user.id,
    ).toBe('admin');
    await expect(
      service.verify(normal.secret, 'crm', 'read-release'),
    ).rejects.toMatchObject({ status: 401 });
    await keyService.remove(normal.key.id);
    expect(
      await new ApiKeyService(authentication, 'default').get(normal.key.id),
    ).not.toBeNull();
  });

  it('requires Hub management for publishing configuration even with a real owner session', async () => {
    const call = (path: string, body?: object, cookie?: string) =>
      authentication.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method: body ? 'POST' : 'GET',
          headers: {
            'content-type': 'application/json',
            ...(cookie ? { cookie } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
    const signup = await call('/sign-up/email', {
      name: 'Owner',
      email: 'owner@example.com',
      password: 'test-owner-password-123',
    });
    expect(signup.status).toBe(200);
    const cookie = signup.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const owner = await authentication.getSession(new Headers({ cookie }));
    expect(owner).not.toBeNull();
    const publishing = await keyService.create({
      userId: owner!.user.id,
      name: 'Publishing',
    });
    const normal = await new ApiKeyService(authentication, 'default').create({
      userId: owner!.user.id,
      name: 'Normal',
    });
    for (const [path, body] of [
      ['/api-key/create', { name: 'Bypass' }],
      ['/api-key/update', { keyId: publishing.key.id, enabled: true }],
      ['/api-key/delete', { keyId: publishing.key.id }],
    ] as const)
      expect(
        (await call(path, { ...body, configId: HUB_API_KEY_CONFIG_ID }, cookie))
          .status,
      ).toBe(403);
    expect(
      (
        await call(
          `/api-key/get?id=${publishing.key.id}&configId=${HUB_API_KEY_CONFIG_ID}`,
          undefined,
          cookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          `/api-key/list?configId=${HUB_API_KEY_CONFIG_ID}`,
          undefined,
          cookie,
        )
      ).status,
    ).toBe(403);
    const list = await call('/api-key/list', undefined, cookie);
    expect(list.status).toBe(200);
    const text = await list.text();
    expect(text).toContain(normal.key.id);
    expect(text).not.toContain(publishing.key.id);
    expect(
      (
        await call(
          '/api-key/update',
          { keyId: publishing.key.id, enabled: true },
          cookie,
        )
      ).status,
    ).toBe(404);
    await keyService.disable(publishing.key.id);
    expect(await keyService.verify(publishing.secret)).toBeNull();
    await keyService.remove(publishing.key.id);
    await keyService.remove(publishing.key.id);
    expect(await keyService.get(publishing.key.id)).toBeNull();
  });
});
