// @vitest-environment node

import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { AppRuntimeRegistry } from '@nocobase/app-host';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../server/app.ts';
import { RuntimeSecretService } from '../../server/hub/runtime-secret-service.ts';

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const resourceGenerator = path.join(
  packageRoot,
  'scripts/build-default-app-resources.mjs',
);
const roots: string[] = [];
const apps: Array<ReturnType<typeof createApp>> = [];
const registries: AppRuntimeRegistry[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close?.()));
  await Promise.all(
    registries
      .splice(0)
      .map((registry) => registry.destroyAll({ reason: 'test cleanup' })),
  );
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('default application bootstrap', () => {
  it('starts a fresh Hub without creating a default APP', async () => {
    const fixture = await createFixture({ buildResources: false });
    const registry = createRegistry();
    const app = createFixtureApp(fixture, registry, false);
    apps.push(app);

    await expect(app.hubReady).resolves.toBeUndefined();
    await expect(setupStatus(app)).resolves.toMatchObject({
      data: {
        setupRequired: true,
        defaultApp: {
          status: 'preparing',
          retryable: false,
          errorCode: null,
        },
      },
    });
    const browserOrigin = 'http://127.0.0.1:13000';
    const cookie = await createOwnerAndSignIn(app, browserOrigin);
    const applications = await app.request(`${browserOrigin}/hub/api/apps`, {
      headers: { cookie },
    });
    expect(applications.status).toBe(200);
    await expect(applications.json()).resolves.toMatchObject({
      data: [],
      meta: { total: 0 },
    });
    expect(registry.snapshot('default')).toBeUndefined();

    const state = await readBootstrapState(fixture.databasePath);
    expect(state).toEqual({});
    await expect(
      readDefaultRecords(fixture.databasePath),
    ).resolves.toMatchObject({
      application: undefined,
      releases: 0,
      deployments: 0,
      runtimeSecrets: 0,
    });
  });

  it('keeps the application list empty after restart', async () => {
    const fixture = await createFixture();
    const firstRegistry = createRegistry();
    const first = createFixtureApp(fixture, firstRegistry, true);
    apps.push(first);

    await first.hubReady;
    await expect(setupStatus(first)).resolves.toMatchObject({
      data: {
        setupRequired: true,
        defaultApp: {
          status: 'preparing',
          retryable: false,
          errorCode: null,
        },
      },
    });
    expect(firstRegistry.snapshot('default')).toBeUndefined();
    await first.close?.();
    apps.splice(apps.indexOf(first), 1);
    await firstRegistry.destroyAll({ reason: 'restart' });
    registries.splice(registries.indexOf(firstRegistry), 1);

    const secondRegistry = createRegistry();
    const second = createFixtureApp(fixture, secondRegistry, true);
    apps.push(second);
    await second.hubReady;

    await expect(setupStatus(second)).resolves.toMatchObject({
      data: { defaultApp: { status: 'preparing' } },
    });
    const database = await openSqlite(fixture.databasePath);
    try {
      const applications = await database('hub_applications').select('*');
      const releases = await database('hub_releases').select('*');
      const deployments = await database('hub_deployments').select('*');
      const runtimeSecrets = await database('hub_runtime_secrets').select('*');
      expect(applications).toHaveLength(0);
      expect(releases).toHaveLength(0);
      expect(deployments).toHaveLength(0);
      expect(runtimeSecrets).toHaveLength(0);
      expect(secondRegistry.snapshot('default')).toBeUndefined();
    } finally {
      await database.destroy();
    }
  });

  it('preserves explicit retry for a failed default APP bootstrap', async () => {
    const fixture = await createFixture({ buildResources: false });
    const ensureInitial = RuntimeSecretService.prototype.ensureInitial;
    const ensureSecret = vi
      .spyOn(RuntimeSecretService.prototype, 'ensureInitial')
      .mockRejectedValue(new Error('transient secret storage failure'));
    const registry = createRegistry();
    const app = createFixtureApp(fixture, registry, false);
    apps.push(app);
    await app.hubReady;

    await expect(setupStatus(app)).resolves.toMatchObject({
      data: {
        defaultApp: {
          status: 'preparing',
          retryable: false,
          errorCode: null,
        },
      },
    });
    expect(ensureSecret).not.toHaveBeenCalled();

    const browserOrigin = 'http://127.0.0.1:13000';
    const cookie = await createOwnerAndSignIn(app, browserOrigin);
    const retry = await app.request(
      `${browserOrigin}/hub/api/setup/default-app/retry`,
      {
        method: 'POST',
        headers: {
          cookie,
          origin: browserOrigin,
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: '{}',
      },
    );
    expect(retry.status).toBe(202);
    await expect(retry.json()).resolves.toMatchObject({
      data: { defaultApp: { status: 'preparing' } },
      meta: { idempotent: false },
    });

    await expect(waitForDefaultStatus(app, 'failed')).resolves.toMatchObject({
      status: 'failed',
      retryable: true,
      errorCode: 'DEFAULT_APP_BOOTSTRAP_FAILED',
    });
    expect(ensureSecret).toHaveBeenCalledTimes(1);

    ensureSecret.mockImplementation(async function (applicationId) {
      return ensureInitial.call(this, applicationId);
    });
    const replay = await app.request(
      `${browserOrigin}/hub/api/setup/default-app/retry`,
      {
        method: 'POST',
        headers: {
          cookie,
          origin: browserOrigin,
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: '{}',
      },
    );
    expect(replay.status).toBe(202);
    await expect(replay.json()).resolves.toMatchObject({
      data: { defaultApp: { status: 'preparing' } },
      meta: { idempotent: false },
    });
    await expect(waitForDefaultStatus(app, 'ready')).resolves.toMatchObject({
      status: 'ready',
      retryable: false,
      errorCode: null,
    });
    await expect(
      readDefaultRecords(fixture.databasePath),
    ).resolves.toMatchObject({
      application: { active_release_id: null },
      releases: 0,
      deployments: 0,
      runtimeSecrets: 1,
    });
  });
});

interface Fixture {
  readonly root: string;
  readonly databasePath: string;
  readonly releaseRoot: string;
  readonly resources: string;
}

async function createFixture(
  options: { readonly buildResources?: boolean } = {},
): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'hub-default-bootstrap-'));
  roots.push(root);
  const build = path.join(root, 'template-build');
  const resources = path.join(root, 'resources');
  if (options.buildResources !== false) {
    await mkdir(path.join(build, 'server'), { recursive: true });
    await mkdir(path.join(build, 'client'), { recursive: true });
    const fixtureServer = path.resolve(
      packageRoot,
      'tests/fixtures/default-app-embedded.mjs',
    );
    await cp(fixtureServer, path.join(build, 'server/embedded.js'));
    await writeFile(
      path.join(build, 'client/index.html'),
      '<main>Default</main>',
    );
    await execFileAsync(process.execPath, [
      resourceGenerator,
      '--build-dir',
      build,
      '--output-dir',
      resources,
    ]);
  }
  return {
    root,
    databasePath: path.join(root, 'hub.sqlite'),
    releaseRoot: path.join(root, 'releases'),
    resources,
  };
}

function createFixtureApp(
  fixture: Fixture,
  registry: AppRuntimeRegistry,
  includeResources: boolean,
): ReturnType<typeof createApp> {
  return createApp({
    appName: 'hub',
    basePath: '/hub',
    nocoBaseApiUrl: false,
    databasePath: fixture.databasePath,
    authSecret: 'default-bootstrap-auth-secret-at-least-32-chars',
    authBaseUrl: 'http://127.0.0.1:13000/hub/api/auth',
    releaseRoot: fixture.releaseRoot,
    defaultAppResourcesDirectory: includeResources
      ? fixture.resources
      : undefined,
    runtimeSecretEncryptionKey: Buffer.alloc(32, 7).toString('base64url'),
    appHostRegistry: registry,
  });
}

function createRegistry(): AppRuntimeRegistry {
  const registry = new AppRuntimeRegistry({
    startEvictionLoop: false,
    resolveFactory: () => () => ({ fetch: () => Response.json({ ok: true }) }),
  });
  registries.push(registry);
  return registry;
}

async function setupStatus(
  app: ReturnType<typeof createApp>,
): Promise<Record<string, unknown>> {
  const response = await app.request(
    'http://127.0.0.1:13000/hub/api/setup/status',
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

async function waitForDefaultStatus(
  app: ReturnType<typeof createApp>,
  expected: string,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = (await setupStatus(app)) as {
      data?: { defaultApp?: Record<string, unknown> };
    };
    if (response.data?.defaultApp?.status === expected) {
      return response.data.defaultApp;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Default application did not reach ${expected}.`);
}

async function createOwnerAndSignIn(
  app: ReturnType<typeof createApp>,
  origin: string,
): Promise<string> {
  const credentials = {
    email: 'owner@example.com',
    password: 'correct horse battery staple',
  };
  const owner = await app.request(`${origin}/hub/api/setup/owner`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ ...credentials, name: 'Owner' }),
  });
  expect(owner.status).toBe(201);
  const signIn = await app.request(`${origin}/hub/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  expect(signIn.status).toBe(200);
  return signIn.headers.get('set-cookie') ?? '';
}

async function openSqlite(filename: string): Promise<import('knex').Knex> {
  const { default: knex } = await import('knex');
  return knex({ client: 'better-sqlite3', connection: { filename } });
}

async function readBootstrapState(
  filename: string,
): Promise<Record<string, unknown>> {
  const database = await openSqlite(filename);
  try {
    const row = await database('hub_settings')
      .where({ key: 'setup.defaultApplication.bootstrap' })
      .first<{ value: string }>();
    return JSON.parse(row?.value ?? '{}') as Record<string, unknown>;
  } finally {
    await database.destroy();
  }
}

async function readDefaultRecords(filename: string): Promise<{
  application: Record<string, unknown> | undefined;
  releases: number;
  deployments: number;
  runtimeSecrets: number;
}> {
  const database = await openSqlite(filename);
  try {
    const application = await database('hub_applications')
      .where({ is_default: 1 })
      .first<Record<string, unknown>>();
    const [{ total: releases }] = await database('hub_releases').count<
      Array<{ total: number }>
    >({ total: '*' });
    const [{ total: deployments }] = await database('hub_deployments').count<
      Array<{ total: number }>
    >({ total: '*' });
    const [{ total: runtimeSecrets }] = await database(
      'hub_runtime_secrets',
    ).count<Array<{ total: number }>>({ total: '*' });
    return {
      application,
      releases: Number(releases),
      deployments: Number(deployments),
      runtimeSecrets: Number(runtimeSecrets),
    };
  } finally {
    await database.destroy();
  }
}
