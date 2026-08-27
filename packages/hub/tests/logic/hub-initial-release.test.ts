// @vitest-environment node

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { AppRuntimeRegistry } from '@nocobase/app-host';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp, type HubApp } from '../../server/app.ts';

const execFileAsync = promisify(execFile);
const browserOrigin = 'http://127.0.0.1:13230';
const authSecret = 'hub-initial-release-test-secret-at-least-32-characters';
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const resourceGenerator = path.join(
  packageRoot,
  'scripts/build-default-app-resources.mjs',
);
const roots: string[] = [];
const apps: HubApp[] = [];
const registries: AppRuntimeRegistry[] = [];

describe('Hub application creation', () => {
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

  it('creates an application without an initial release', async () => {
    const fixture = await createFixture();
    const registry = new AppRuntimeRegistry({
      startEvictionLoop: false,
      readinessTimeoutMs: 100,
      readinessIntervalMs: 5,
      resolveFactory: () => () => ({
        fetch: () => Response.json({ ok: true }),
      }),
    });
    registries.push(registry);
    const app = createApp({
      appName: 'hub',
      basePath: '/hub',
      browserBasePath: '/hub',
      hub: true,
      databasePath: fixture.databasePath,
      authSecret,
      authBaseUrl: `${browserOrigin}/hub/api/auth`,
      appPublicOrigin: 'http://127.0.0.1:3000',
      releaseRoot: fixture.releaseRoot,
      defaultAppResourcesDirectory: fixture.resources,
      runtimeSecretEncryptionKey: Buffer.alloc(32, 7).toString('base64'),
      appHostRegistry: registry,
    });
    apps.push(app);
    await app.hubReady;
    const cookie = await setupOwnerAndSignIn(app);

    const create = await request(app, cookie, '/apps', {
      method: 'POST',
      headers: { 'idempotency-key': 'create-sales' },
      body: JSON.stringify({ slug: 'sales', name: 'Sales CRM' }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()).data;
    expect(created).toMatchObject({
      slug: 'sales',
      latestRelease: null,
      activeRelease: null,
    });

    const releaseList = await request(
      app,
      cookie,
      `/apps/${created.id}/releases`,
    );
    await expect(releaseList.json()).resolves.toMatchObject({
      data: [],
      meta: { total: 0 },
    });
  });

  it('does not inspect template artifacts when creating an application', async () => {
    const fixture = await createFixture();
    await writeFile(
      path.join(fixture.resources, 'initial-release.tar.gz'),
      'invalid archive',
    );
    const app = createApp({
      appName: 'hub',
      basePath: '/hub',
      browserBasePath: '/hub',
      hub: true,
      databasePath: fixture.databasePath,
      authSecret,
      authBaseUrl: `${browserOrigin}/hub/api/auth`,
      releaseRoot: fixture.releaseRoot,
      defaultAppResourcesDirectory: fixture.resources,
      runtimeSecretEncryptionKey: Buffer.alloc(32, 7).toString('base64'),
    });
    apps.push(app);
    await app.hubReady;
    const cookie = await setupOwnerAndSignIn(app);

    const create = await request(app, cookie, '/apps', {
      method: 'POST',
      headers: { 'idempotency-key': 'create-mismatched' },
      body: JSON.stringify({ slug: 'mismatched', name: 'Mismatched' }),
    });
    expect(create.status).toBe(201);
    await expect(create.json()).resolves.toMatchObject({
      data: {
        slug: 'mismatched',
        latestRelease: null,
        activeRelease: null,
      },
    });
    const applications = await request(app, cookie, '/apps?query=mismatched');
    await expect(applications.json()).resolves.toMatchObject({
      data: [{ slug: 'mismatched', latestRelease: null }],
      meta: { total: 1 },
    });
  });
});

interface Fixture {
  readonly root: string;
  readonly databasePath: string;
  readonly releaseRoot: string;
  readonly resources: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'hub-initial-release-'));
  roots.push(root);
  const build = path.join(root, 'template-build');
  const resources = path.join(root, 'resources');
  await mkdir(path.join(build, 'server'), { recursive: true });
  await mkdir(path.join(build, 'client/assets'), { recursive: true });
  await writeFile(
    path.join(build, 'server/embedded.js'),
    'export default async () => ({ fetch: () => Response.json({ ok: true }) });\n',
  );
  await writeFile(
    path.join(build, 'client/index.html'),
    '<script type="module" src="/default/assets/app.js"></script>\n',
  );
  await writeFile(
    path.join(build, 'client/assets/app.js'),
    'export const chunk = "/default/assets/chunk.js";\n',
  );
  await execFileAsync(process.execPath, [
    resourceGenerator,
    '--build-dir',
    build,
    '--output-dir',
    resources,
    '--version',
    '0.0.1',
  ]);
  return {
    root,
    databasePath: path.join(root, 'hub.sqlite'),
    releaseRoot: path.join(root, 'releases'),
    resources,
  };
}

async function setupOwnerAndSignIn(app: HubApp): Promise<string> {
  const owner = await app.request(`${browserOrigin}/hub/api/setup/owner`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: browserOrigin },
    body: JSON.stringify({
      email: 'owner@example.com',
      password: 'correct horse battery staple',
      name: 'Hub Owner',
      username: 'owner',
    }),
  });
  expect(owner.status).toBe(201);
  const signIn = await app.request(
    `${browserOrigin}/hub/api/auth/sign-in/email`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: browserOrigin },
      body: JSON.stringify({
        email: 'owner@example.com',
        password: 'correct horse battery staple',
      }),
    },
  );
  expect(signIn.status).toBe(200);
  return signIn.headers.get('set-cookie') ?? '';
}

async function request(
  app: HubApp,
  cookie: string,
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('cookie', cookie);
  if (init.method && init.method !== 'GET' && init.method !== 'HEAD') {
    headers.set('origin', browserOrigin);
    headers.set('content-type', 'application/json');
  }
  return app.request(`${browserOrigin}/hub/api${pathname}`, {
    ...init,
    headers,
  });
}
