// @vitest-environment node

import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { AppRuntimeRegistry } from '@nocobase/app-host';
import { Auth } from '@nocobase/app-plugin-authentication';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../../server/app.ts';
import { createHubApi } from '../../server/hub/api.ts';
import { createHubDatabase } from '../../server/hub/database.ts';
import { HubStore } from '../../server/hub/store.ts';

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
  it('persists invalid packaged resources as a non-retryable bootstrap failure', async () => {
    const fixture = await createFixture();
    await writeFile(path.join(fixture.resources, 'metadata.json'), '{invalid');
    const registry = createRegistry();
    const app = createFixtureApp(fixture, registry);
    apps.push(app);

    await expect(app.hubReady).resolves.toBeUndefined();
    await expect(setupStatus(app)).resolves.toMatchObject({
      data: {
        defaultApp: {
          status: 'failed',
          retryable: false,
          errorCode: 'DEFAULT_APP_RESOURCES_INVALID',
        },
      },
    });

    const state = await readBootstrapState(fixture.databasePath);
    expect(state).toMatchObject({
      status: 'failed',
      step: 'failed',
      attempt: 1,
      errorCode: 'DEFAULT_APP_RESOURCES_INVALID',
      retryable: false,
    });
  });

  it('recovers automatically after invalid packaged resources are replaced', async () => {
    const fixture = await createFixture();
    const validMetadata = await readFile(
      path.join(fixture.resources, 'metadata.json'),
      'utf8',
    );
    await writeFile(path.join(fixture.resources, 'metadata.json'), '{invalid');
    const firstRegistry = createRegistry();
    const first = createFixtureApp(fixture, firstRegistry);
    apps.push(first);
    await first.hubReady;
    await expect(setupStatus(first)).resolves.toMatchObject({
      data: { defaultApp: { status: 'failed' } },
    });
    await first.close?.();
    apps.splice(apps.indexOf(first), 1);
    await firstRegistry.destroyAll({ reason: 'replace resources' });
    registries.splice(registries.indexOf(firstRegistry), 1);

    await writeFile(
      path.join(fixture.resources, 'metadata.json'),
      validMetadata,
    );
    const secondRegistry = createRegistry();
    const second = createFixtureApp(fixture, secondRegistry);
    apps.push(second);
    await second.hubReady;

    await expect(setupStatus(second)).resolves.toMatchObject({
      data: { defaultApp: { status: 'ready' } },
    });
  });

  it('retries transient startup failures a bounded number of times', async () => {
    const fixture = await createFixture();
    let activation = 0;
    const registry = new AppRuntimeRegistry({
      startEvictionLoop: false,
      readinessTimeoutMs: 25,
      readinessIntervalMs: 5,
      resolveFactory: () => {
        activation += 1;
        const healthy = activation >= 3;
        return () => ({
          fetch: () =>
            healthy
              ? Response.json({ ok: true })
              : Response.json({ ok: false }, { status: 503 }),
        });
      },
    });
    registries.push(registry);
    const app = createFixtureApp(fixture, registry);
    apps.push(app);

    await app.hubReady;

    expect(activation).toBe(3);
    await expect(setupStatus(app)).resolves.toMatchObject({
      data: { defaultApp: { status: 'ready' } },
    });
    await expect(
      readBootstrapState(fixture.databasePath),
    ).resolves.toMatchObject({
      status: 'ready',
      attempt: 3,
    });
  });

  it('bootstraps when unfinished deployment recovery is disabled', async () => {
    const fixture = await createFixture();
    const registry = createRegistry();
    const database = createHubDatabase({ filename: fixture.databasePath });
    const authOptions = {
      connection: database.connection,
      baseURL: 'http://127.0.0.1:13000',
      basePath: '/hub/api/auth',
      secret: 'default-bootstrap-auth-secret-at-least-32-chars',
    } as const;
    const auth = new Auth({
      ...authOptions,
      emailAndPassword: { enabled: true, disableSignUp: true },
    });
    const bootstrapAuth = new Auth({
      ...authOptions,
      emailAndPassword: { enabled: true },
    });
    const api = createHubApi(
      {
        database,
        auth,
        bootstrapAuth,
        appName: 'hub',
        publicBasePath: '/hub',
        releaseRoot: fixture.releaseRoot,
        defaultAppResourcesDirectory: fixture.resources,
        runtimeSecretEncryptionKey: {
          key: Buffer.alloc(32, 7),
          keyId: 'test-default-bootstrap-key',
        },
        registry,
      },
      { recoverDeployments: false },
    );
    const mounted = new Hono();
    mounted.route('/hub/api', api);

    try {
      await api.ready;
      const status = await mounted.request(
        'http://127.0.0.1:13000/hub/api/setup/status',
      );
      await expect(status.json()).resolves.toMatchObject({
        data: { defaultApp: { status: 'ready' } },
      });
    } finally {
      await api.close();
      await database.close();
    }
  });

  it('does not report an incomplete default application as ready without resources', async () => {
    const fixture = await createFixture();
    const database = createHubDatabase({ filename: fixture.databasePath });
    await database.ready;
    await new HubStore(database.connection).createApplication(
      { slug: 'default', name: 'Default application' },
      'system',
      { id: 'system-default-application', isDefault: true },
    );
    await database.close();

    const registry = createRegistry();
    const app = createApp({
      appName: 'hub',
      basePath: '/hub',
      nocoBaseApiUrl: false,
      databasePath: fixture.databasePath,
      authSecret: 'default-bootstrap-auth-secret-at-least-32-chars',
      authBaseUrl: 'http://127.0.0.1:13000/hub/api/auth',
      releaseRoot: fixture.releaseRoot,
      runtimeSecretEncryptionKey: Buffer.alloc(32, 7).toString('base64url'),
      appHostRegistry: registry,
    });
    apps.push(app);

    await app.hubReady;
    await expect(setupStatus(app)).resolves.toMatchObject({
      data: { defaultApp: { status: 'preparing' } },
    });
  });

  it('creates, releases, deploys, and resumes exactly one default APP', async () => {
    const fixture = await createFixture();
    const firstRegistry = createRegistry();
    const first = createFixtureApp(fixture, firstRegistry);
    apps.push(first);

    await first.hubReady;
    await expect(setupStatus(first)).resolves.toMatchObject({
      data: {
        setupRequired: true,
        defaultApp: {
          status: 'ready',
          retryable: false,
          errorCode: null,
        },
      },
    });
    expect(firstRegistry.snapshot('default')).toMatchObject({
      state: 'active',
      releaseId: expect.any(String),
    });
    await first.close?.();
    apps.splice(apps.indexOf(first), 1);
    await firstRegistry.destroyAll({ reason: 'restart' });
    registries.splice(registries.indexOf(firstRegistry), 1);

    const secondRegistry = createRegistry();
    const second = createFixtureApp(fixture, secondRegistry);
    apps.push(second);
    await second.hubReady;

    await expect(setupStatus(second)).resolves.toMatchObject({
      data: { defaultApp: { status: 'ready' } },
    });
    const database = await openSqlite(fixture.databasePath);
    try {
      const applications = await database('hub_applications')
        .where({ is_default: 1 })
        .select('*');
      const releases = await database('hub_releases').select('*');
      const deployments = await database('hub_deployments').select('*');
      expect(applications).toHaveLength(1);
      expect(applications[0]).toMatchObject({
        slug: 'default',
        active_release_id: expect.any(String),
      });
      expect(releases).toHaveLength(1);
      expect(deployments).toHaveLength(1);
      expect(deployments[0]).toMatchObject({ status: 'succeeded' });
    } finally {
      await database.destroy();
    }
  });

  it('persists a retryable failure, then retries it through the approved API', async () => {
    const fixture = await createFixture();
    let hostHealthy = false;
    const registry = createRegistry(() => hostHealthy);
    const app = createFixtureApp(fixture, registry);
    apps.push(app);
    await app.hubReady;

    await expect(setupStatus(app)).resolves.toMatchObject({
      data: {
        defaultApp: {
          status: 'failed',
          retryable: true,
          errorCode: 'RUNTIME_READINESS_FAILED',
        },
      },
    });

    const browserOrigin = 'http://127.0.0.1:13000';
    const cookie = await createOwnerAndSignIn(app, browserOrigin);
    hostHealthy = true;
    const idempotencyKey = crypto.randomUUID();
    const retry = await app.request(
      `${browserOrigin}/hub/api/setup/default-app/retry`,
      {
        method: 'POST',
        headers: {
          cookie,
          origin: browserOrigin,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: '{}',
      },
    );
    expect(retry.status).toBe(202);
    await expect(retry.json()).resolves.toMatchObject({
      data: { defaultApp: { status: 'preparing' } },
      meta: { idempotent: false },
    });

    const replayInProgress = await app.request(
      `${browserOrigin}/hub/api/setup/default-app/retry`,
      {
        method: 'POST',
        headers: {
          cookie,
          origin: browserOrigin,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: '{}',
      },
    );
    expect(replayInProgress.status).toBe(202);
    await expect(replayInProgress.json()).resolves.toMatchObject({
      data: { defaultApp: { status: 'preparing' } },
      meta: { idempotent: true },
    });

    await expect(waitForDefaultStatus(app, 'ready')).resolves.toMatchObject({
      status: 'ready',
      retryable: false,
      errorCode: null,
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
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      data: { defaultApp: { status: 'ready' } },
      meta: { idempotent: true },
    });
  }, 15_000);
});

interface Fixture {
  readonly root: string;
  readonly databasePath: string;
  readonly releaseRoot: string;
  readonly resources: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'hub-default-bootstrap-'));
  roots.push(root);
  const build = path.join(root, 'template-build');
  const resources = path.join(root, 'resources');
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
): ReturnType<typeof createApp> {
  return createApp({
    appName: 'hub',
    basePath: '/hub',
    nocoBaseApiUrl: false,
    databasePath: fixture.databasePath,
    authSecret: 'default-bootstrap-auth-secret-at-least-32-chars',
    authBaseUrl: 'http://127.0.0.1:13000/hub/api/auth',
    releaseRoot: fixture.releaseRoot,
    defaultAppResourcesDirectory: fixture.resources,
    runtimeSecretEncryptionKey: Buffer.alloc(32, 7).toString('base64url'),
    appHostRegistry: registry,
  });
}

function createRegistry(
  healthy: () => boolean = () => true,
): AppRuntimeRegistry {
  const registry = new AppRuntimeRegistry({
    startEvictionLoop: false,
    readinessTimeoutMs: 50,
    readinessIntervalMs: 5,
    resolveFactory: () => () => ({
      fetch: () =>
        healthy()
          ? Response.json({ ok: true })
          : Response.json({ ok: false }, { status: 503 }),
    }),
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
