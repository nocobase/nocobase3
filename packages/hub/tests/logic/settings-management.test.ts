// @vitest-environment node

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../../server/app.ts';
import { createNativeAuthRuntime } from '../../server/native-auth/index.ts';
import {
  createNativeSettingsAuthorizer,
  createNocoBaseSettingsAuthorizer,
  createSettingsSecretBox,
  JsonSettingsStore,
  SettingsService,
  type SettingsActor,
  type StorageSettingsDraft,
} from '../../server/settings/index.ts';

const tempDirs: string[] = [];
const actor: SettingsActor = {
  id: '1',
  name: 'Settings Manager',
  role: 'root',
};

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('settings management', () => {
  it('persists storage settings and their audit atomically across service instances', async () => {
    const filePath = await createStorePath();
    const firstService = new SettingsService(new JsonSettingsStore(filePath));

    const saved = await firstService.saveStorage('hub', fsDraft(), actor);
    const restartedService = new SettingsService(
      new JsonSettingsStore(filePath),
    );
    const reloaded = await restartedService.getStorage('hub', actor);

    expect(saved).toMatchObject({
      appId: 'hub',
      status: 'saved',
      applyStatus: 'pending-runtime-apply',
    });
    expect(reloaded).toMatchObject({
      name: 'local',
      localPath: 'storage/uploads',
      secretConfigured: false,
    });

    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as {
      storage: unknown[];
      audit: Array<{ action: string; status: string }>;
    };
    expect(persisted.storage).toHaveLength(1);
    expect(persisted.audit).toMatchObject([
      { action: 'save', status: 'succeeded' },
      { action: 'read', status: 'succeeded' },
    ]);
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it('encrypts the complete S3 credential pair and never returns or stores plaintext', async () => {
    const filePath = await createStorePath();
    const secretBox = createSettingsSecretBox(
      'unit-test-encryption-key-at-least-32',
    );
    const service = new SettingsService(
      new JsonSettingsStore(filePath),
      secretBox,
    );
    const draft = s3Draft();

    const saved = await service.saveStorage('orders', draft, actor);
    const updated = await service.saveStorage(
      'orders',
      { ...draft, accessKeyId: '', secretAccessKey: '', bucket: 'next' },
      actor,
    );
    const file = await readFile(filePath, 'utf8');

    expect(saved).toMatchObject({
      accessKeyId: '',
      accessKeyIdConfigured: true,
      secretAccessKey: '',
      secretConfigured: true,
    });
    expect(updated.bucket).toBe('next');
    expect(file).not.toContain(draft.accessKeyId);
    expect(file).not.toContain(draft.secretAccessKey);
    expect(file).toContain('credentialsEncrypted');
  });

  it('fails closed when S3 credentials cannot be encrypted', async () => {
    const filePath = await createStorePath();
    const service = new SettingsService(new JsonSettingsStore(filePath));

    await expect(
      service.saveStorage('hub', s3Draft(), actor),
    ).rejects.toMatchObject({
      code: 'SETTINGS_ENCRYPTION_NOT_CONFIGURED',
      status: 503,
    });
    await expect(service.getStorage('hub', actor)).resolves.toBeNull();
  });

  it('blocks unsafe local paths and private S3 endpoints on the server', async () => {
    const filePath = await createStorePath();
    const service = new SettingsService(
      new JsonSettingsStore(filePath),
      createSettingsSecretBox('unit-test-encryption-key-at-least-32'),
    );

    await expect(
      service.saveStorage(
        'hub',
        { ...fsDraft(), localPath: '../../outside' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'SETTINGS_LOCAL_PATH_INVALID' });
    await expect(
      service.testStorage(
        'hub',
        { ...s3Draft(), endpoint: 'http://127.0.0.1:9000' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'SETTINGS_SSRF_BLOCKED' });
  });

  it('exposes authenticated Hub routes that save and read back server state', async () => {
    const filePath = await createStorePath();
    const service = new SettingsService(new JsonSettingsStore(filePath));
    const app = createApp({
      basePath: '/hub',
      nocoBaseApiUrl: false,
      settings: {
        appId: 'hub',
        service,
        authorize: async () => actor,
      },
    });

    const saved = await app.request(
      'http://localhost/hub/api/settings/storage',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(fsDraft()),
      },
    );
    const loaded = await app.request(
      'http://localhost/hub/api/settings/storage',
    );

    expect(saved.status).toBe(200);
    await expect(saved.json()).resolves.toMatchObject({
      data: { appId: 'hub', status: 'saved' },
    });
    await expect(loaded.json()).resolves.toMatchObject({
      data: { localPath: 'storage/uploads' },
    });
  });

  it('isolates storage settings by App and rejects unsafe App identifiers', async () => {
    const filePath = await createStorePath();
    const service = new SettingsService(new JsonSettingsStore(filePath));
    const app = createApp({
      basePath: '/hub',
      nocoBaseApiUrl: false,
      settings: {
        defaultAppId: 'hub',
        service,
        authorize: async () => actor,
      },
    });

    const saved = await app.request(
      'http://localhost/hub/api/settings/apps/orders/storage',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...fsDraft(), name: 'orders-files' }),
      },
    );
    expect(saved.status).toBe(200);
    await expect(saved.json()).resolves.toMatchObject({
      data: { appId: 'orders', name: 'orders-files' },
    });

    const orders = await app.request(
      'http://localhost/hub/api/settings/apps/orders/storage',
    );
    const hub = await app.request('http://localhost/hub/api/settings/storage');
    expect(orders.status).toBe(200);
    await expect(orders.json()).resolves.toMatchObject({
      data: { appId: 'orders', name: 'orders-files' },
    });
    await expect(hub.json()).resolves.toEqual({ data: null });

    const unsafe = await app.request(
      'http://localhost/hub/api/settings/apps/bad%24id/storage',
    );
    expect(unsafe.status).toBe(400);
    await expect(unsafe.json()).resolves.toMatchObject({
      code: 'SETTINGS_APP_ID_INVALID',
    });
  });

  it('enforces administrator roles and CSRF before settings writes', async () => {
    const authorizer = createNocoBaseSettingsAuthorizer({
      apiUrl: 'http://nocobase.local/api',
      fetch: (async () =>
        Response.json({
          data: {
            id: 9,
            nickname: 'Ordinary User',
            roles: [{ name: 'member' }],
          },
        })) as typeof fetch,
    });

    await expect(
      authorizer(
        new Request('http://hub.local/api/settings/storage', {
          method: 'PUT',
          headers: { cookie: 'csrfToken=one', 'x-csrf-token': 'two' },
        }),
      ),
    ).rejects.toMatchObject({ code: 'SETTINGS_CSRF_INVALID', status: 403 });

    await expect(
      authorizer(
        new Request('http://hub.local/api/settings/storage', {
          method: 'GET',
        }),
      ),
    ).rejects.toMatchObject({ code: 'SETTINGS_FORBIDDEN', status: 403 });
  });

  it('authenticates, authorizes, and persists settings without a V2 service', async () => {
    const directory = await createTempDirectory();
    const databasePath = path.join(directory, 'hub.sqlite');
    const settingsPath = path.join(directory, 'settings.json');
    let runtime = createTestAuthRuntime(databasePath);
    await runtime.ready();

    let app = createApp({
      basePath: '/hub',
      nocoBaseApiUrl: false,
      nativeAuth: runtime,
      settings: {
        appId: 'hub',
        service: new SettingsService(new JsonSettingsStore(settingsPath)),
        authorize: createNativeSettingsAuthorizer({
          auth: runtime,
          database: runtime.database,
        }),
      },
    });

    const adminCookie = await createAccountAndSignIn(app, {
      name: 'Hub Admin',
      username: 'hubadmin',
      email: 'admin@example.com',
      password: 'correct-horse-battery-staple',
    });
    const unauthorized = await app.request(
      'http://localhost/hub/api/settings/storage',
    );
    expect(unauthorized.status).toBe(401);

    const saved = await app.request(
      'http://localhost/hub/api/settings/storage',
      {
        method: 'PUT',
        headers: {
          cookie: adminCookie,
          'content-type': 'application/json',
          'x-requested-with': 'NocoBase3',
        },
        body: JSON.stringify(fsDraft()),
      },
    );
    expect(saved.status).toBe(200);

    const memberCookie = await createAccountAndSignIn(app, {
      name: 'Hub Member',
      username: 'hubmember',
      email: 'member@example.com',
      password: 'correct-horse-battery-staple',
    });
    const forbidden = await app.request(
      'http://localhost/hub/api/settings/storage',
      { headers: { cookie: memberCookie } },
    );
    expect(forbidden.status).toBe(403);

    await runtime.close();
    runtime = createTestAuthRuntime(databasePath);
    await runtime.ready();
    app = createApp({
      basePath: '/hub',
      nocoBaseApiUrl: false,
      nativeAuth: runtime,
      settings: {
        appId: 'hub',
        service: new SettingsService(new JsonSettingsStore(settingsPath)),
        authorize: createNativeSettingsAuthorizer({
          auth: runtime,
          database: runtime.database,
        }),
      },
    });
    const restartedCookie = await signIn(app, {
      email: 'admin@example.com',
      password: 'correct-horse-battery-staple',
    });
    const reloaded = await app.request(
      'http://localhost/hub/api/settings/storage',
      { headers: { cookie: restartedCookie } },
    );
    expect(reloaded.status).toBe(200);
    await expect(reloaded.json()).resolves.toMatchObject({
      data: { localPath: 'storage/uploads', status: 'saved' },
    });
    await runtime.close();
  });
});

function createTestAuthRuntime(databasePath: string) {
  return createNativeAuthRuntime({
    appName: 'hub-test',
    authBasePath: '/hub/api/auth',
    authSecret: 'hub-native-auth-test-secret-at-least-32-characters',
    databasePath,
    migrationsDirectory: path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../server/migrations',
    ),
    publicBasePath: '/hub',
  });
}

async function createAccountAndSignIn(
  app: ReturnType<typeof createApp>,
  account: {
    name: string;
    username: string;
    email: string;
    password: string;
  },
): Promise<string> {
  const response = await app.request(
    'http://localhost/hub/api/auth/sign-up/email',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify(account),
    },
  );
  if (response.status !== 200) {
    throw new Error(
      `Sign-up failed (${response.status}): ${await response.text()}`,
    );
  }
  return signIn(app, account);
}

async function signIn(
  app: ReturnType<typeof createApp>,
  account: { email: string; password: string },
): Promise<string> {
  const response = await app.request(
    'http://localhost/hub/api/auth/sign-in/email',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify(account),
    },
  );
  if (response.status !== 200) {
    throw new Error(
      `Sign-in failed (${response.status}): ${await response.text()}`,
    );
  }
  const setCookie = response.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';', 1)[0];
  expect(cookie).toContain('=');
  return cookie;
}

async function createStorePath(): Promise<string> {
  const directory = await createTempDirectory();
  return path.join(directory, 'settings.json');
}

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-hub-settings-'),
  );
  tempDirs.push(directory);
  return directory;
}

function fsDraft(): StorageSettingsDraft {
  return {
    name: 'local',
    driver: 'fs',
    visibility: 'public',
    isDefault: true,
    localPath: 'storage/uploads',
    publicUrl: '/storage/uploads',
    endpoint: '',
    region: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    forcePathStyle: false,
    supportsAcl: true,
  };
}

function s3Draft(): StorageSettingsDraft {
  return {
    ...fsDraft(),
    name: 's3',
    driver: 's3',
    visibility: 'private',
    localPath: '',
    endpoint: '',
    region: 'cn-hangzhou',
    bucket: 'app-files',
    accessKeyId: 'test-access-key-id',
    secretAccessKey: 'test-secret-access-key',
  };
}
