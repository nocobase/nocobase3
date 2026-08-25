// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AppHostClient,
  createReleaseManagement,
  createNocoBaseReleaseAuthorizer,
  createReleaseManagementRoutes,
  JsonDeploymentStore,
  InMemoryReleaseWorkflowStore,
  NocoBaseDeploymentStore,
  ReleaseManagementService,
  StoreReleaseNotificationSink,
  type DeploymentKind,
  type DeploymentRecord,
  type DeploymentStore,
  type ReleaseActor,
} from '../../server/index.ts';

const tempDirs: string[] = [];
const actor: ReleaseActor = { id: '1', name: 'Release Manager', role: 'root' };

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('release management', () => {
  it('sends the App Host control token only from the server', async () => {
    const requests: Request[] = [];
    const client = new AppHostClient({
      baseUrl: 'http://app-host.internal:3000',
      controlToken: 'server-secret',
      fetch: (async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ active: [], definitions: [], releases: [] });
      }) as typeof fetch,
    });

    await client.overview();

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('http://app-host.internal:3000/__apps');
    expect(requests[0].headers.get('authorization')).toBe(
      'Bearer server-secret',
    );
  });

  it('refreshes the registered database resource from the live App health endpoint', async () => {
    const requests: Request[] = [];
    const client = new AppHostClient({
      baseUrl: 'http://app-host.internal:3000',
      controlToken: 'server-secret',
      fetch: (async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        const path = new URL(request.url).pathname;
        if (path === '/__apps') {
          return Response.json({
            active: [
              {
                ...activeApp('release-v1'),
                resources: [
                  {
                    id: 'database:primary',
                    kind: 'database',
                    name: 'Orders 主数据库',
                    status: 'active',
                    provider: '@nocobase/database',
                    updatedAt: '2026-08-23T12:00:00.000Z',
                    error: null,
                  },
                ],
              },
            ],
            definitions: [{ id: 'orders', basePath: '/orders' }],
            releases: [release('release-v1', '1.0.0')],
          });
        }
        if (path === '/orders/healthz') {
          return Response.json(
            {
              ok: false,
              resources: [
                {
                  id: 'database:primary',
                  kind: 'database',
                  name: 'Orders 主数据库',
                  status: 'error',
                  provider: '@nocobase/database',
                  updatedAt: '2026-08-23T12:05:00.000Z',
                  error: {
                    code: 'DATABASE_UNAVAILABLE',
                    message: '数据库连接检查失败，请查看 Runtime 日志。',
                  },
                },
              ],
            },
            { status: 503 },
          );
        }
        return Response.json({}, { status: 404 });
      }) as typeof fetch,
    });

    await expect(client.overview()).resolves.toMatchObject({
      active: [
        {
          resources: [
            {
              id: 'database:primary',
              status: 'error',
              error: { code: 'DATABASE_UNAVAILABLE' },
            },
          ],
        },
      ],
    });
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/__apps',
      '/orders/healthz',
    ]);
    expect(requests[0].headers.get('authorization')).toBe(
      'Bearer server-secret',
    );
    expect(requests[1].headers.has('authorization')).toBe(false);
  });

  it('lists only apps that have immutable releases', async () => {
    const client = new AppHostClient({
      baseUrl: 'http://app-host.internal:3000',
      fetch: (async () =>
        Response.json({
          active: [
            {
              id: 'demo',
              appName: 'demo',
              basePath: '/demo',
              codeVersion: 'local',
              releaseId: null,
              state: 'active',
              updatedAt: new Date().toISOString(),
            },
            {
              id: 'crm',
              appName: 'crm',
              displayName: '销售运营中心',
              basePath: '/crm',
              accessUrl: 'https://apps.example.com/runtime/crm/',
              codeVersion: '2.0.0',
              releaseId: 'release-v2',
              state: 'active',
              updatedAt: new Date().toISOString(),
              resources: [
                {
                  id: 'database:primary',
                  kind: 'database',
                  name: 'CRM 主数据库',
                  status: 'active',
                  provider: '@nocobase/database',
                  updatedAt: '2026-08-23T12:00:00.000Z',
                  details: {
                    connectionName: 'sqlite',
                    dialect: 'sqlite',
                    driver: 'better-sqlite3',
                    filename: '/private/data/crm.sqlite',
                  },
                  error: null,
                },
              ],
            },
          ],
          definitions: [{ id: 'demo' }, { id: 'service' }],
          releases: [
            release('release-v2', '2.0.0', 'crm'),
            release('release-v1', '1.0.0', 'orders'),
          ],
        })) as typeof fetch,
    });
    const service = new ReleaseManagementService(
      client,
      new MemoryDeploymentStore(),
    );

    await expect(service.overview()).resolves.toMatchObject({
      apps: [
        {
          id: 'crm',
          name: '销售运营中心',
          basePath: '/crm',
          accessUrl: '/crm/',
          activeReleaseId: 'release-v2',
          activeVersion: '2.0.0',
          state: 'active',
          resources: [
            expect.objectContaining({
              id: 'database:primary',
              name: 'CRM 主数据库',
              status: 'active',
            }),
          ],
        },
        {
          id: 'orders',
          basePath: null,
          accessUrl: null,
          activeReleaseId: null,
          activeVersion: null,
          state: 'not-deployed',
        },
      ],
    });
    expect(JSON.stringify(await service.overview())).not.toContain(
      'crm.sqlite',
    );
  });

  it('does not expose an unsafe App base path or App Host URL', async () => {
    const client = new AppHostClient({
      baseUrl: 'http://app-host.internal:3000',
      fetch: (async () =>
        Response.json({
          active: [
            {
              id: 'orders',
              basePath: '/../orders',
              accessUrl: 'javascript:alert(1)',
              codeVersion: '1.0.0',
              releaseId: 'release-v1',
              state: 'active',
              updatedAt: new Date().toISOString(),
            },
          ],
          definitions: [{ id: 'orders', basePath: '/../orders' }],
          releases: [release('release-v1', '1.0.0')],
        })) as typeof fetch,
    });
    const service = new ReleaseManagementService(
      client,
      new MemoryDeploymentStore(),
    );

    await expect(service.overview()).resolves.toMatchObject({
      apps: [{ id: 'orders', accessUrl: null }],
    });
  });

  it('does not route an App through another App base path', async () => {
    const client = new AppHostClient({
      baseUrl: 'http://app-host.internal:3000',
      fetch: (async () =>
        Response.json({
          active: [
            {
              id: 'orders',
              basePath: '/crm',
              accessUrl: 'http://app-host.internal:3000/crm/',
              codeVersion: '1.0.0',
              releaseId: 'release-v1',
              state: 'active',
              updatedAt: new Date().toISOString(),
            },
          ],
          definitions: [{ id: 'orders', basePath: '/crm' }],
          releases: [release('release-v1', '1.0.0')],
        })) as typeof fetch,
    });
    const service = new ReleaseManagementService(
      client,
      new MemoryDeploymentStore(),
    );

    await expect(service.overview()).resolves.toMatchObject({
      apps: [{ id: 'orders', accessUrl: null }],
    });
  });

  it('keeps a persisted release visible while its runtime is idle', async () => {
    const client = new AppHostClient({
      baseUrl: 'http://app-host.internal:3000',
      fetch: (async () =>
        Response.json({
          active: [],
          activeReleases: [
            {
              appId: 'orders',
              releaseId: 'release-v1',
              artifactSha256: 'checksum-v1',
              activatedAt: '2026-08-18T01:00:00.000Z',
            },
          ],
          definitions: [{ id: 'orders', basePath: '/orders' }],
          releases: [release('release-v1', '1.0.0')],
        })) as typeof fetch,
    });
    const service = new ReleaseManagementService(
      client,
      new MemoryDeploymentStore(),
    );

    await expect(service.overview()).resolves.toMatchObject({
      apps: [
        {
          id: 'orders',
          accessUrl: '/orders/',
          activeReleaseId: 'release-v1',
          activeVersion: '1.0.0',
          state: 'idle',
        },
      ],
    });
  });

  it('reconciles repeated deployments and records a blocked release without replacing the active release', async () => {
    let activeReleaseId = 'release-v1';
    let deployCalls = 0;
    const client = new AppHostClient({
      baseUrl: 'http://app-host.internal:3000',
      fetch: (async (input, init) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (request.method === 'GET' && url.pathname === '/__apps') {
          return Response.json({
            active: [activeApp(activeReleaseId)],
            definitions: [{ id: 'orders' }],
            releases: [
              release('release-v1', '1.0.0'),
              release('release-v2', '2.0.0'),
              release('release-broken', '3.0.0'),
            ],
          });
        }

        deployCalls += 1;
        const body = (await request.json()) as { releaseId: string };
        if (body.releaseId === 'release-broken') {
          return Response.json(
            {
              error: 'readiness check returned 503',
              code: 'APP_READINESS_FAILED',
            },
            { status: 422 },
          );
        }

        const previousReleaseId = activeReleaseId;
        const changed = activeReleaseId !== body.releaseId;
        activeReleaseId = body.releaseId;
        return Response.json({
          deployment: {
            id: 'orders',
            previousReleaseId,
            activeReleaseId,
            activeVersion: activeReleaseId === 'release-v2' ? '2.0.0' : '1.0.0',
            changed,
          },
        });
      }) as typeof fetch,
    });
    const store = new MemoryDeploymentStore();
    const service = new ReleaseManagementService(client, store);

    const deployed = await service.execute({
      appId: 'orders',
      releaseId: 'release-v2',
      kind: 'deploy',
      idempotencyKey: 'agent-run-1',
      actor,
    });
    const repeated = await service.execute({
      appId: 'orders',
      releaseId: 'release-v2',
      kind: 'deploy',
      idempotencyKey: 'agent-run-1',
      actor,
    });
    const blocked = await service.execute({
      appId: 'orders',
      releaseId: 'release-broken',
      kind: 'deploy',
      idempotencyKey: 'agent-run-2',
      actor,
    });
    const repeatedBlocked = await service.execute({
      appId: 'orders',
      releaseId: 'release-broken',
      kind: 'deploy',
      idempotencyKey: 'agent-run-2',
      actor,
    });

    expect(deployed).toMatchObject({
      status: 'succeeded',
      activeReleaseId: 'release-v2',
    });
    expect(repeated.id).toBe(deployed.id);
    expect(blocked).toMatchObject({
      status: 'failed',
      activeReleaseId: 'release-v2',
      error: { code: 'APP_READINESS_FAILED' },
    });
    expect(repeatedBlocked.id).toBe(blocked.id);
    expect(deployCalls).toBe(2);

    await expect(
      service.execute({
        appId: 'orders',
        releaseId: 'release-v1',
        kind: 'deploy',
        idempotencyKey: 'agent-run-1',
        actor,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT', status: 409 });
    expect(deployCalls).toBe(2);
  });

  it('serializes and audits idempotent app lifecycle operations', async () => {
    let lifecycleCalls = 0;
    const client = new AppHostClient({
      baseUrl: 'http://app-host.internal:3000',
      fetch: (async (input, init) => {
        const request = new Request(input, init);
        const pathname = new URL(request.url).pathname;
        if (request.method === 'GET') {
          return Response.json({
            active: [activeApp('release-v1')],
            activeReleases: [],
            definitions: [{ id: 'orders', basePath: '/orders' }],
            lifecycle: [
              {
                appId: 'orders',
                desiredState: 'running',
                runtimeState: 'active',
                updatedAt: null,
                lastError: null,
              },
            ],
            releases: [release('release-v1', '1.0.0')],
          });
        }
        lifecycleCalls += 1;
        expect(pathname).toBe('/__apps/orders/stop');
        return Response.json({
          lifecycle: {
            appId: 'orders',
            action: 'stop',
            changed: true,
            desiredState: 'stopped',
            runtimeState: 'stopped',
            updatedAt: '2026-08-25T00:00:00.000Z',
            lastError: null,
          },
        });
      }) as typeof fetch,
    });
    const service = new ReleaseManagementService(
      client,
      new MemoryDeploymentStore(),
    );
    const input = {
      appId: 'orders',
      action: 'stop' as const,
      idempotencyKey: 'stop-orders-once',
      actor,
    };

    const [first, repeated] = await Promise.all([
      service.executeLifecycle(input),
      service.executeLifecycle(input),
    ]);

    expect(first).toMatchObject({
      action: 'stop',
      status: 'succeeded',
      desiredState: 'stopped',
      runtimeState: 'stopped',
    });
    expect(repeated.id).toBe(first.id);
    expect(lifecycleCalls).toBe(1);
    await expect(service.overview()).resolves.toMatchObject({
      lifecycleOperations: [{ id: first.id, action: 'stop' }],
    });
  });

  it('runs release approval, notification, deployment, and rollback as one idempotent chain', async () => {
    let activeReleaseId = 'release-v1';
    let deployCalls = 0;
    const client = new AppHostClient({
      baseUrl: 'http://app-host.internal:3000',
      fetch: (async (input, init) => {
        const request = new Request(input, init);
        if (request.method === 'GET') {
          return Response.json({
            active: [activeApp(activeReleaseId)],
            definitions: [{ id: 'orders', basePath: '/orders' }],
            releases: [
              release('release-v1', '1.0.0'),
              release('release-v2', '2.0.0'),
            ],
          });
        }
        deployCalls += 1;
        const body = (await request.json()) as { releaseId: string };
        const previousReleaseId = activeReleaseId;
        activeReleaseId = body.releaseId;
        return Response.json({
          deployment: {
            id: 'orders',
            previousReleaseId,
            activeReleaseId,
            activeVersion: activeReleaseId === 'release-v2' ? '2.0.0' : '1.0.0',
            changed: previousReleaseId !== activeReleaseId,
          },
        });
      }) as typeof fetch,
    });
    const workflowStore = new InMemoryReleaseWorkflowStore();
    const service = new ReleaseManagementService(
      client,
      new MemoryDeploymentStore(),
      {
        store: workflowStore,
        notifications: new StoreReleaseNotificationSink(workflowStore),
      },
    );

    const requested = await service.requestApproval({
      appId: 'orders',
      releaseId: 'release-v2',
      kind: 'deploy',
      idempotencyKey: 'agent-release-v2',
      actor,
    });
    const repeatedRequest = await service.requestApproval({
      appId: 'orders',
      releaseId: 'release-v2',
      kind: 'deploy',
      idempotencyKey: 'agent-release-v2',
      actor,
    });

    expect(requested.status).toBe('pending');
    expect(repeatedRequest.id).toBe(requested.id);
    expect(deployCalls).toBe(0);
    await expect(workflowStore.listNotifications()).resolves.toHaveLength(1);

    const approved = await service.decideApproval({
      approvalId: requested.id,
      decision: 'approve',
      comment: 'Smoke checks passed',
      actor,
    });
    const repeatedApproval = await service.decideApproval({
      approvalId: requested.id,
      decision: 'approve',
      actor,
    });

    expect(approved).toMatchObject({
      status: 'succeeded',
      decisionComment: 'Smoke checks passed',
    });
    expect(repeatedApproval.id).toBe(approved.id);
    expect(activeReleaseId).toBe('release-v2');
    expect(deployCalls).toBe(1);
    await expect(workflowStore.listNotifications()).resolves.toMatchObject([
      { event: 'approval_requested' },
      { event: 'approval_approved' },
      { event: 'deployment_succeeded' },
    ]);

    const rollback = await service.requestApproval({
      appId: 'orders',
      releaseId: 'release-v1',
      kind: 'rollback',
      idempotencyKey: 'agent-rollback-v1',
      actor,
    });
    await service.decideApproval({
      approvalId: rollback.id,
      decision: 'approve',
      actor,
    });

    expect(activeReleaseId).toBe('release-v1');
    expect(deployCalls).toBe(2);
  });

  it('rejects a release approval without calling App Host or duplicating notifications', async () => {
    let deployCalls = 0;
    const client = new AppHostClient({
      baseUrl: 'http://app-host.internal:3000',
      fetch: (async (input) => {
        const request = new Request(input);
        if (request.method !== 'GET') deployCalls += 1;
        return Response.json({
          active: [activeApp('release-v1')],
          definitions: [{ id: 'orders', basePath: '/orders' }],
          releases: [
            release('release-v1', '1.0.0'),
            release('release-v2', '2.0.0'),
          ],
        });
      }) as typeof fetch,
    });
    const workflowStore = new InMemoryReleaseWorkflowStore();
    const service = new ReleaseManagementService(
      client,
      new MemoryDeploymentStore(),
      {
        store: workflowStore,
        notifications: new StoreReleaseNotificationSink(workflowStore),
      },
    );
    const requested = await service.requestApproval({
      appId: 'orders',
      releaseId: 'release-v2',
      kind: 'deploy',
      idempotencyKey: 'agent-release-rejected',
      actor,
    });

    const rejected = await service.decideApproval({
      approvalId: requested.id,
      decision: 'reject',
      comment: 'Change window is closed',
      actor,
    });
    const repeated = await service.decideApproval({
      approvalId: requested.id,
      decision: 'reject',
      actor,
    });

    expect(rejected).toMatchObject({
      status: 'rejected',
      decisionComment: 'Change window is closed',
    });
    expect(repeated.id).toBe(rejected.id);
    expect(deployCalls).toBe(0);
    await expect(workflowStore.listNotifications()).resolves.toMatchObject([
      { event: 'approval_requested' },
      { event: 'approval_rejected' },
    ]);
  });

  it('persists updates atomically without duplicating an operation', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'nocobase-hub-release-store-'),
    );
    tempDirs.push(directory);
    const filePath = path.join(directory, 'deployments.json');
    const store = new JsonDeploymentStore(filePath);
    const pending = deploymentRecord({ status: 'pending', completedAt: null });
    const completed = deploymentRecord({
      id: pending.id,
      status: 'succeeded',
      completedAt: new Date().toISOString(),
    });

    await store.save(pending);
    await store.save(completed);

    await expect(store.list()).resolves.toEqual([completed]);
    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as {
      deployments: DeploymentRecord[];
    };
    expect(persisted.deployments).toEqual([completed]);
  });

  it('persists release audits in NocoBase and reads them back as deployment records', async () => {
    const api = createAuditApi();
    const store = new NocoBaseDeploymentStore({
      apiUrl: 'http://nocobase.local/api',
      accessToken: 'audit-service-token',
      role: 'root',
      fetch: api.fetch,
    });
    const pending = deploymentRecord();
    const completed = deploymentRecord({
      status: 'succeeded',
      changed: true,
      activeReleaseId: 'release-v2',
      activeVersion: '2.0.0',
      completedAt: new Date().toISOString(),
    });

    await store.save(pending);
    await store.save(completed);

    await expect(
      store.findByIdempotencyKey('orders', 'deploy', 'agent-run-1'),
    ).resolves.toEqual(completed);
    await expect(store.list('orders')).resolves.toEqual([completed]);
    expect(api.rows).toHaveLength(1);
    expect(
      api.requests.every(
        (request) =>
          request.headers.get('authorization') === 'Bearer audit-service-token',
      ),
    ).toBe(true);
    expect(
      api.requests.every((request) => request.headers.get('x-role') === 'root'),
    ).toBe(true);
  });

  it('migrates legacy JSON audit history idempotently into NocoBase', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'nocobase-hub-release-migration-'),
    );
    tempDirs.push(directory);
    const filePath = path.join(directory, 'release-management.json');
    const legacyStore = new JsonDeploymentStore(filePath);
    const legacyRecord = deploymentRecord({
      status: 'failed',
      completedAt: new Date().toISOString(),
    });
    await legacyStore.save(legacyRecord);
    const api = createAuditApi();

    const first = new NocoBaseDeploymentStore({
      apiUrl: 'http://nocobase.local/api',
      accessToken: 'audit-service-token',
      legacyFilePath: filePath,
      fetch: api.fetch,
    });
    const second = new NocoBaseDeploymentStore({
      apiUrl: 'http://nocobase.local/api',
      accessToken: 'audit-service-token',
      legacyFilePath: filePath,
      fetch: api.fetch,
    });

    await expect(first.list()).resolves.toEqual([legacyRecord]);
    await expect(second.list()).resolves.toEqual([legacyRecord]);
    expect(api.rows).toHaveLength(1);
    expect(
      api.requests.filter((request) =>
        new URL(request.url).pathname.endsWith(':create'),
      ),
    ).toHaveLength(1);
  });

  it('fails closed before calling App Host when NocoBase audit storage is unavailable', async () => {
    let appHostCalls = 0;
    const appHost = new AppHostClient({
      baseUrl: 'http://app-host.internal:3000',
      fetch: (async () => {
        appHostCalls += 1;
        return Response.json({});
      }) as typeof fetch,
    });
    const store = new NocoBaseDeploymentStore({
      apiUrl: 'http://nocobase.local/api',
      accessToken: 'audit-service-token',
      fetch: (async () =>
        Response.json(
          { errors: [{ message: 'database unavailable' }] },
          { status: 503 },
        )) as typeof fetch,
    });
    const service = new ReleaseManagementService(appHost, store);

    await expect(
      service.execute({
        appId: 'orders',
        releaseId: 'release-v2',
        kind: 'deploy',
        idempotencyKey: 'agent-run-1',
        actor,
      }),
    ).rejects.toMatchObject({ code: 'RELEASE_AUDIT_UNAVAILABLE', status: 503 });
    expect(appHostCalls).toBe(0);
  });

  it('bounds NocoBase audit outages with a server-side timeout', async () => {
    const store = new NocoBaseDeploymentStore({
      apiUrl: 'http://nocobase.local/api',
      accessToken: 'audit-service-token',
      timeoutMs: 5,
      fetch: ((_, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          );
        })) as typeof fetch,
    });

    await expect(store.list()).rejects.toMatchObject({
      code: 'RELEASE_AUDIT_UNAVAILABLE',
      status: 503,
    });
  });

  it('keeps release management unavailable when the server audit credential is missing', async () => {
    const releaseManagement = createReleaseManagement({
      appHostUrl: 'http://app-host.internal:3000',
      nocoBaseApiUrl: 'http://nocobase.local/api',
      storePath: '/tmp/unused-release-management.json',
    });

    await expect(releaseManagement.service.deployments()).rejects.toMatchObject(
      {
        code: 'RELEASE_AUDIT_NOT_CONFIGURED',
        status: 503,
      },
    );
  });

  it('requires a server-authorized manager and an idempotency key on write routes', async () => {
    const client = new AppHostClient({
      baseUrl: 'http://app-host.internal:3000',
      fetch: (async () =>
        Response.json({
          active: [],
          definitions: [],
          releases: [],
        })) as typeof fetch,
    });
    const service = new ReleaseManagementService(
      client,
      new MemoryDeploymentStore(),
    );
    const app = new Hono();
    app.route(
      '/hub/api/release-management',
      createReleaseManagementRoutes({
        service,
        authorize: async () => actor,
      }),
    );

    const response = await app.request(
      'http://localhost/hub/api/release-management/apps/orders/deployments',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ releaseId: 'release-v2' }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
  });

  it('keeps App Host behind the approval route before activating a release', async () => {
    let activeReleaseId = 'release-v1';
    let deployCalls = 0;
    const client = new AppHostClient({
      baseUrl: 'http://app-host.internal:3000',
      fetch: (async (input, init) => {
        const request = new Request(input, init);
        if (request.method === 'GET') {
          return Response.json({
            active: [activeApp(activeReleaseId)],
            definitions: [{ id: 'orders', basePath: '/orders' }],
            releases: [
              release('release-v1', '1.0.0'),
              release('release-v2', '2.0.0'),
            ],
          });
        }
        deployCalls += 1;
        const body = (await request.json()) as { releaseId: string };
        const previousReleaseId = activeReleaseId;
        activeReleaseId = body.releaseId;
        return Response.json({
          deployment: {
            id: 'orders',
            previousReleaseId,
            activeReleaseId,
            activeVersion: '2.0.0',
            changed: true,
          },
        });
      }) as typeof fetch,
    });
    const workflowStore = new InMemoryReleaseWorkflowStore();
    const service = new ReleaseManagementService(
      client,
      new MemoryDeploymentStore(),
      {
        store: workflowStore,
        notifications: new StoreReleaseNotificationSink(workflowStore),
      },
    );
    const app = new Hono();
    app.route(
      '/hub/api/release-management',
      createReleaseManagementRoutes({
        service,
        authorize: async () => actor,
      }),
    );

    const requestResponse = await app.request(
      'http://localhost/hub/api/release-management/apps/orders/deployments',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'agent-release-v2-http',
        },
        body: JSON.stringify({ releaseId: 'release-v2' }),
      },
    );
    const requestPayload = (await requestResponse.json()) as {
      approval: { id: string; status: string };
    };

    expect(requestResponse.status).toBe(202);
    expect(requestPayload.approval.status).toBe('pending');
    expect(activeReleaseId).toBe('release-v1');
    expect(deployCalls).toBe(0);

    const decisionResponse = await app.request(
      `http://localhost/hub/api/release-management/approvals/${requestPayload.approval.id}/decision`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'approve' }),
      },
    );

    expect(decisionResponse.status).toBe(200);
    await expect(decisionResponse.json()).resolves.toMatchObject({
      approval: { status: 'succeeded' },
    });
    expect(activeReleaseId).toBe('release-v2');
    expect(deployCalls).toBe(1);
  });

  it('derives release authority from NocoBase user roles', async () => {
    const authorize = createNocoBaseReleaseAuthorizer({
      apiUrl: 'http://nocobase.internal/api',
      fetch: (async (input, init) => {
        const request = new Request(input, init);
        expect(request.url).toBe('http://nocobase.internal/api/auth:check');
        expect(request.headers.get('authorization')).toBe('Bearer user-token');
        return Response.json({
          data: {
            id: 7,
            nickname: 'Agent Operator',
            roles: [{ name: 'member' }, { name: 'root' }],
          },
        });
      }) as typeof fetch,
    });

    await expect(
      authorize(
        new Request('http://hub.local/', {
          headers: { authorization: 'Bearer user-token' },
        }),
      ),
    ).resolves.toEqual({ id: '7', name: 'Agent Operator', role: 'root' });
  });

  it('requires CSRF proof for Cookie-authenticated release writes', async () => {
    const authorize = createNocoBaseReleaseAuthorizer({
      apiUrl: 'http://nocobase.internal/api',
      fetch: (async () =>
        Response.json({
          data: { id: 7, username: 'root', roles: [{ name: 'root' }] },
        })) as typeof fetch,
    });
    const withoutCsrf = new Request('http://hub.local/', {
      method: 'POST',
      headers: { cookie: 'session=active; csrfToken=expected' },
    });
    const withCsrf = new Request('http://hub.local/', {
      method: 'POST',
      headers: {
        cookie: 'session=active; csrfToken=expected',
        'x-csrf-token': 'expected',
      },
    });

    await expect(authorize(withoutCsrf)).rejects.toMatchObject({
      code: 'RELEASE_CSRF_INVALID',
    });
    await expect(authorize(withCsrf)).resolves.toMatchObject({
      id: '7',
      role: 'root',
    });
  });
});

class MemoryDeploymentStore implements DeploymentStore {
  private readonly records: DeploymentRecord[] = [];

  async list(appId?: string): Promise<DeploymentRecord[]> {
    return this.records.filter((record) => !appId || record.appId === appId);
  }

  async findByIdempotencyKey(
    appId: string,
    kind: DeploymentKind,
    idempotencyKey: string,
  ): Promise<DeploymentRecord | null> {
    return (
      this.records.find(
        (record) =>
          record.appId === appId &&
          record.kind === kind &&
          record.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }

  async save(record: DeploymentRecord): Promise<void> {
    const index = this.records.findIndex(
      (candidate) => candidate.id === record.id,
    );
    if (index >= 0) {
      this.records[index] = structuredClone(record);
    } else {
      this.records.push(structuredClone(record));
    }
  }
}

function activeApp(releaseId: string) {
  return {
    id: 'orders',
    basePath: '/orders',
    accessUrl: 'http://app-host.internal:3000/orders/',
    codeVersion: releaseId === 'release-v2' ? '2.0.0' : '1.0.0',
    releaseId,
    state: 'active',
    updatedAt: new Date().toISOString(),
  };
}

function release(id: string, version: string, appId = 'orders') {
  return {
    appId,
    id,
    version,
    createdAt: new Date().toISOString(),
    runtime: { healthPath: '/healthz' },
  };
}

function deploymentRecord(
  overrides: Partial<DeploymentRecord> = {},
): DeploymentRecord {
  return {
    id: 'deployment-1',
    idempotencyKey: 'agent-run-1',
    appId: 'orders',
    releaseId: 'release-v2',
    kind: 'deploy',
    status: 'pending',
    changed: null,
    previousReleaseId: null,
    activeReleaseId: null,
    activeVersion: null,
    actor,
    requestedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    ...overrides,
  };
}

interface AuditApi {
  fetch: typeof fetch;
  requests: Request[];
  rows: Array<Record<string, unknown>>;
}

function createAuditApi(): AuditApi {
  const requests: Request[] = [];
  const rows: Array<Record<string, unknown>> = [];
  let nextId = 1;
  const auditFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    requests.push(request);
    const url = new URL(request.url);
    if (url.pathname.endsWith(':list')) {
      const rawFilter = url.searchParams.get('filter');
      const filter = rawFilter
        ? (JSON.parse(rawFilter) as Record<string, unknown>)
        : {};
      const data = rows.filter((row) =>
        Object.entries(filter).every(([key, value]) => row[key] === value),
      );
      return Response.json({ data, meta: { totalPage: 1 } });
    }
    if (url.pathname.endsWith(':create')) {
      const body = (await request.json()) as Record<string, unknown>;
      rows.push({ id: nextId++, ...body });
      return Response.json({ data: rows.at(-1) }, { status: 201 });
    }
    if (url.pathname.endsWith(':update')) {
      const id = Number(url.searchParams.get('filterByTk'));
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) {
        return Response.json(
          { errors: [{ message: 'not found' }] },
          { status: 404 },
        );
      }
      const body = (await request.json()) as Record<string, unknown>;
      rows[index] = { ...rows[index], ...body };
      return Response.json({ data: rows[index] });
    }
    return Response.json(
      { errors: [{ message: 'unsupported action' }] },
      { status: 404 },
    );
  };

  return { fetch: auditFetch as typeof fetch, requests, rows };
}
