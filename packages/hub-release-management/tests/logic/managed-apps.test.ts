// @vitest-environment node

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AppHostClient,
  AppManagementService,
  createAppManagementRoutes,
  createReleaseManagementRoutes,
  InMemoryDeploymentStore,
  InMemoryReleaseWorkflowStore,
  JsonManagedAppStore,
  ReleaseManagementError,
  ReleaseManagementService,
  StoreReleaseNotificationSink,
  type ReleaseActor,
} from '../../server/index.ts';

const actor: ReleaseActor = { id: 'admin-1', name: 'Admin', role: 'admin' };
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('managed apps', () => {
  it('rejects App IDs that the App Host runtime cannot activate', async () => {
    const directory = await createTempDirectory();
    const service = new AppManagementService(
      emptyAppHost(),
      new JsonManagedAppStore(path.join(directory, 'apps.json')),
    );

    await expect(
      service.create({ appId: 'crm.v2', name: 'CRM' }, actor),
    ).rejects.toMatchObject({ code: 'INVALID_APP_ID', status: 400 });
  });

  it('creates and lists an App on the exact /api/apps contract', async () => {
    const directory = await createTempDirectory();
    const service = new AppManagementService(
      emptyAppHost(),
      new JsonManagedAppStore(path.join(directory, 'apps.json')),
    );
    const routes = new Hono();
    routes.route(
      '/api/apps',
      createAppManagementRoutes({ service, authorize: async () => actor }),
    );

    const created = await routes.request('http://hub.local/api/apps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId: 'crm', name: 'CRM' }),
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      app: { appId: 'crm', name: 'CRM', status: 'not-deployed' },
      deployToken: expect.stringMatching(/^nb3_app_/),
    });

    const listed = await routes.request('http://hub.local/api/apps');
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      apps: [{ appId: 'crm', name: 'CRM', status: 'not-deployed' }],
    });
  });

  it('persists a placeholder without persisting the plaintext deploy token', async () => {
    const directory = await createTempDirectory();
    const filePath = path.join(directory, 'managed-apps.json');
    const service = new AppManagementService(
      emptyAppHost(),
      new JsonManagedAppStore(filePath),
    );

    const created = await service.create({ appId: 'crm', name: 'CRM' }, actor);

    expect(created.app).toMatchObject({
      appId: 'crm',
      name: 'CRM',
      status: 'not-deployed',
      createdBy: actor,
    });
    expect(created.deployToken).toMatch(/^nb3_app_[A-Za-z0-9_-]{43}$/);
    const persisted = await readFile(filePath, 'utf8');
    expect(persisted).not.toContain(created.deployToken);
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it('merges a release-less managed app into the release overview', async () => {
    const directory = await createTempDirectory();
    const store = new JsonManagedAppStore(path.join(directory, 'apps.json'));
    const appHost = emptyAppHost();
    const apps = new AppManagementService(appHost, store);
    await apps.create({ appId: 'crm', name: 'CRM Workspace' }, actor);
    const releases = new ReleaseManagementService(
      appHost,
      new InMemoryDeploymentStore(),
      undefined,
      undefined,
      store,
    );

    await expect(releases.overview()).resolves.toMatchObject({
      apps: [
        {
          id: 'crm',
          name: 'CRM Workspace',
          state: 'not-deployed',
          activeReleaseId: null,
          activeVersion: null,
          releases: [],
        },
      ],
    });
  });

  it('rotates a scoped token and rejects the previous value', async () => {
    const directory = await createTempDirectory();
    const service = new AppManagementService(
      emptyAppHost(),
      new JsonManagedAppStore(path.join(directory, 'apps.json')),
    );
    const created = await service.create({ appId: 'crm', name: 'CRM' }, actor);
    const rotated = await service.rotateDeployToken('crm', actor);

    await expect(
      service.authorizeDeployToken(created.deployToken, 'crm'),
    ).rejects.toMatchObject({ code: 'APP_DEPLOY_TOKEN_INVALID', status: 401 });
    await expect(
      service.authorizeDeployToken(rotated.deployToken, 'crm'),
    ).resolves.toMatchObject({ role: 'app-deployer' });
  });

  it('streams an App-scoped upload to App Host with only the internal token', async () => {
    const directory = await createTempDirectory();
    const requests: Request[] = [];
    const appHost = new AppHostClient({
      baseUrl: 'http://app-host.internal:13200',
      controlToken: 'internal-control-token',
      fetch: (async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.method === 'GET') {
          return Response.json({ active: [], definitions: [], releases: [] });
        }
        expect(await request.text()).toBe('compressed-release');
        return Response.json(
          {
            status: 'created',
            release: {
              appId: 'crm',
              id: '0.1.0-deadbeefcafe',
              version: '0.1.0',
              createdAt: null,
              runtime: {},
            },
          },
          { status: 201 },
        );
      }) as typeof fetch,
    });
    const service = new AppManagementService(
      appHost,
      new JsonManagedAppStore(path.join(directory, 'apps.json')),
    );
    const created = await service.create({ appId: 'crm', name: 'CRM' }, actor);
    const routes = new Hono();
    routes.route(
      '/api/apps',
      createAppManagementRoutes({ service, authorize: async () => actor }),
    );

    const response = await routes.request(
      'http://hub.local/api/apps/crm/releases/0.1.0-deadbeefcafe',
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${created.deployToken}`,
          'content-type': 'application/vnd.nocobase.release+tar+gzip',
        },
        body: 'compressed-release',
      },
    );

    expect(response.status).toBe(201);
    const upload = requests.find((request) => request.method === 'PUT');
    expect(upload?.url).toBe(
      'http://app-host.internal:13200/__apps/crm/releases/0.1.0-deadbeefcafe',
    );
    expect(upload?.headers.get('authorization')).toBe(
      'Bearer internal-control-token',
    );
    expect(upload?.headers.get('authorization')).not.toContain(
      created.deployToken,
    );
  });

  it('keeps an ordinary admin bearer token on the admin authorization path', async () => {
    const directory = await createTempDirectory();
    const service = new AppManagementService(
      emptyAppHost(),
      new JsonManagedAppStore(path.join(directory, 'apps.json')),
    );
    await service.create({ appId: 'crm', name: 'CRM' }, actor);
    const authorizationHeaders: Array<string | null> = [];
    const routes = new Hono();
    routes.route(
      '/api/apps',
      createAppManagementRoutes({
        service,
        authorize: async (request) => {
          authorizationHeaders.push(request.headers.get('authorization'));
          return actor;
        },
      }),
    );

    const response = await routes.request(
      'http://hub.local/api/apps/crm/releases/release-1',
      {
        method: 'PUT',
        headers: {
          authorization: 'Bearer admin-session-token',
          'content-type': 'application/vnd.nocobase.release+tar+gzip',
        },
        body: 'compressed-release',
      },
    );

    expect(authorizationHeaders).toEqual(['Bearer admin-session-token']);
    expect(response.status).not.toBe(401);
  });

  it('prevents a deploy token from uploading to another App', async () => {
    const directory = await createTempDirectory();
    const service = new AppManagementService(
      emptyAppHost(),
      new JsonManagedAppStore(path.join(directory, 'apps.json')),
    );
    const created = await service.create({ appId: 'crm', name: 'CRM' }, actor);
    await service.create({ appId: 'orders', name: 'Orders' }, actor);

    await expect(
      service.authorizeDeployToken(created.deployToken, 'orders'),
    ).rejects.toMatchObject({
      code: 'APP_DEPLOY_TOKEN_FORBIDDEN',
      status: 403,
    });
  });

  it('allows a scoped token to submit approval but never to decide it', async () => {
    const directory = await createTempDirectory();
    let releaseVisible = false;
    const appHost = new AppHostClient({
      baseUrl: 'http://app-host.internal:13200',
      fetch: (async () =>
        Response.json({
          active: [],
          definitions: [],
          releases: releaseVisible
            ? [
                {
                  appId: 'crm',
                  id: '0.1.0-deadbeefcafe',
                  version: '0.1.0',
                  createdAt: null,
                  runtime: {},
                },
              ]
            : [],
        })) as typeof fetch,
    });
    const managedApps = new AppManagementService(
      appHost,
      new JsonManagedAppStore(path.join(directory, 'apps.json')),
    );
    const created = await managedApps.create(
      { appId: 'crm', name: 'CRM' },
      actor,
    );
    releaseVisible = true;
    const workflowStore = new InMemoryReleaseWorkflowStore();
    const releases = new ReleaseManagementService(
      appHost,
      new InMemoryDeploymentStore(),
      {
        store: workflowStore,
        notifications: new StoreReleaseNotificationSink(workflowStore),
      },
    );
    let adminAuthorizationCalls = 0;
    const routes = new Hono();
    routes.route(
      '/api/release-management',
      createReleaseManagementRoutes({
        service: releases,
        authorize: async (request) => {
          adminAuthorizationCalls += 1;
          if (request.headers.get('authorization')?.includes('nb3_app_')) {
            throw new ReleaseManagementError('Admin session required', {
              status: 403,
              code: 'RELEASE_FORBIDDEN',
            });
          }
          return actor;
        },
        authorizeAppDeployToken: (token, appId) =>
          managedApps.authorizeDeployToken(token, appId),
      }),
    );

    const requested = await routes.request(
      'http://hub.local/api/release-management/apps/crm/deployments',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${created.deployToken}`,
          'content-type': 'application/json',
          'idempotency-key': 'crm-0.1.0-deadbeefcafe',
        },
        body: JSON.stringify({ releaseId: '0.1.0-deadbeefcafe' }),
      },
    );
    const payload = (await requested.json()) as {
      approval: { id: string; requestedBy: ReleaseActor };
    };

    expect(requested.status).toBe(202);
    expect(payload.approval.requestedBy).toMatchObject({
      id: 'app:crm',
      role: 'app-deployer',
    });
    expect(adminAuthorizationCalls).toBe(0);

    const decision = await routes.request(
      `http://hub.local/api/release-management/approvals/${payload.approval.id}/decision`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${created.deployToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ decision: 'approve' }),
      },
    );

    expect(decision.status).toBe(403);
    expect(adminAuthorizationCalls).toBe(1);
  });
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hub-managed-apps-'));
  tempDirectories.push(directory);
  return directory;
}

function emptyAppHost(): AppHostClient {
  return new AppHostClient({
    baseUrl: 'http://app-host.internal:13200',
    fetch: (async () =>
      Response.json({
        active: [],
        definitions: [],
        releases: [],
      })) as typeof fetch,
  });
}
