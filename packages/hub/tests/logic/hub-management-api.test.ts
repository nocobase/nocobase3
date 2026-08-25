// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { createApp, type HubApp } from '../../server/index.ts';
import { computeReleaseArtifactChecksum } from '../../server/hub/artifact-integrity.ts';
import { createHubDatabase } from '../../server/hub/database.ts';
import { HubStore } from '../../server/hub/store.ts';

const execFileAsync = promisify(execFile);
const browserOrigin = 'http://127.0.0.1:13220';
const authSecret = 'hub-management-test-secret-at-least-32-characters';

describe('Hub management API', () => {
  let temporaryRoot: string;
  let databasePath: string;
  let app: HubApp;
  let cookie: string;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), 'hub-management-api-'));
    databasePath = path.join(temporaryRoot, 'hub.sqlite');
    const seedPath = await createRepositorySeed(temporaryRoot);
    app = createApp({
      appName: 'hub',
      basePath: '/hub',
      browserBasePath: '/hub',
      hub: true,
      databasePath,
      authSecret,
      authBaseUrl: `${browserOrigin}/hub/api/auth`,
      appPublicOrigin: 'http://127.0.0.1:3000',
      sourceRoot: path.join(temporaryRoot, 'sources'),
      repositorySeedPath: seedPath,
      releaseRoot: path.join(temporaryRoot, 'releases'),
      runtimeSecretEncryptionKey: Buffer.alloc(32, 7).toString('base64'),
    });
    await app.hubReady;
    cookie = await setupOwnerAndSignIn(app);
  });

  afterEach(async () => {
    await app.close?.();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it('creates a complete application and replays the idempotent request', async () => {
    const create = await request('/apps', {
      method: 'POST',
      headers: { 'idempotency-key': 'create-sales' },
      body: JSON.stringify({
        slug: 'sales',
        name: 'Sales CRM',
        description: 'Sales workspace',
      }),
    });

    expect(create.status).toBe(201);
    const created = await create.json();
    expect(created).toMatchObject({
      data: {
        slug: 'sales',
        status: 'active',
        revision: 1,
        repository: {
          provider: 'hub',
          defaultBranch: 'main',
          status: 'ready',
          headCommit: expect.stringMatching(/^[a-f0-9]{40}$/),
        },
        runtimeSecret: { configured: true, version: 1 },
        links: { self: expect.stringContaining('/hub/api/apps/'), open: null },
      },
      meta: { idempotent: false },
    });
    expect(JSON.stringify(created)).not.toContain('ciphertext');
    expect(JSON.stringify(created)).not.toContain('authSecret');

    const replay = await request('/apps', {
      method: 'POST',
      headers: { 'idempotency-key': 'create-sales' },
      body: JSON.stringify({
        slug: 'sales',
        name: 'Sales CRM',
        description: 'Sales workspace',
      }),
    });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      data: { id: created.data.id, repository: { status: 'ready' } },
      meta: { idempotent: true },
    });

    const repository = await request(`/apps/${created.data.id}/repository`);
    expect(repository.status).toBe(200);
    const repositoryPayload = await repository.json();
    expect(repositoryPayload).toMatchObject({
      data: {
        applicationId: created.data.id,
        cloneUrl: `${browserOrigin}/hub/git/sales.git`,
        initialCommit: created.data.repository.headCommit,
      },
    });
    expect(JSON.stringify(repositoryPayload)).not.toContain('token');

    const list = await request('/apps?query=sales&status=active&sort=name');
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({
      data: [{ id: created.data.id, name: 'Sales CRM' }],
      meta: { total: 1 },
    });

    for (const pathname of [
      '/apps?status=unknown',
      '/apps?sort=unknown',
      '/members?status=pending',
      '/members?role=unknown',
      '/audit-logs?action=unknown.event',
      '/audit-logs?result=unknown',
      '/audit-logs?sort=unknown',
      '/deployments?status=unknown',
      '/deployments?type=unknown',
      '/apps?limit=0',
    ]) {
      const invalidQuery = await request(pathname);
      expect({ pathname, status: invalidQuery.status }).toEqual({
        pathname,
        status: 400,
      });
      await expect(invalidQuery.json()).resolves.toMatchObject({
        error: { code: 'INVALID_QUERY' },
      });
    }
  });

  it('uses ETags for update, archive and restore', async () => {
    const create = await request('/apps', {
      method: 'POST',
      headers: { 'idempotency-key': 'create-inventory' },
      body: JSON.stringify({ slug: 'inventory', name: 'Inventory' }),
    });
    const application = (await create.json()).data;

    const detail = await request(`/apps/${application.id}`);
    expect(detail.headers.get('etag')).toBe('"rev-1"');

    const missingPrecondition = await request(`/apps/${application.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Inventory workspace' }),
    });
    expect(missingPrecondition.status).toBe(428);
    await expect(missingPrecondition.json()).resolves.toMatchObject({
      error: { code: 'PRECONDITION_REQUIRED' },
    });

    const update = await request(`/apps/${application.id}`, {
      method: 'PATCH',
      headers: { 'if-match': '"rev-1"' },
      body: JSON.stringify({ name: 'Inventory workspace' }),
    });
    expect(update.status).toBe(200);
    expect(update.headers.get('etag')).toBe('"rev-2"');

    const stale = await request(`/apps/${application.id}/archive`, {
      method: 'POST',
      headers: { 'if-match': '"rev-1"' },
      body: '{}',
    });
    expect(stale.status).toBe(412);

    const archive = await request(`/apps/${application.id}/archive`, {
      method: 'POST',
      headers: { 'if-match': '"rev-2"' },
      body: '{}',
    });
    expect(archive.status).toBe(200);
    expect(archive.headers.get('etag')).toBe('"rev-3"');
    await expect(archive.json()).resolves.toMatchObject({
      data: { status: 'archived' },
      meta: { idempotent: false },
    });

    const restore = await request(`/apps/${application.id}/restore`, {
      method: 'POST',
      headers: { 'if-match': '"rev-3"' },
      body: '{}',
    });
    expect(restore.status).toBe(200);
    expect(restore.headers.get('etag')).toBe('"rev-4"');
    await expect(restore.json()).resolves.toMatchObject({
      data: { status: 'active' },
      meta: { idempotent: false },
    });
  });

  it('serves runtime, roles, members, audit, settings and storage governance APIs', async () => {
    const create = await request('/apps', {
      method: 'POST',
      headers: { 'idempotency-key': 'create-governed' },
      body: JSON.stringify({ slug: 'governed', name: 'Governed' }),
    });
    const application = (await create.json()).data;

    const runtime = await request(`/apps/${application.id}/runtime`);
    await expect(runtime.json()).resolves.toMatchObject({
      data: {
        applicationId: application.id,
        state: 'stopped',
        health: 'unknown',
      },
    });

    const secret = await request(`/apps/${application.id}/runtime-secret`);
    await expect(secret.json()).resolves.toMatchObject({
      data: { configured: true, version: 1 },
    });
    const rotate = await request(
      `/apps/${application.id}/runtime-secret/rotate`,
      {
        method: 'POST',
        headers: { 'idempotency-key': 'rotate-governed' },
        body: '{}',
      },
    );
    expect(rotate.status).toBe(200);
    await expect(rotate.json()).resolves.toMatchObject({
      data: { configured: true, version: 2 },
      meta: { idempotent: false },
    });

    const roles = await request('/roles');
    await expect(roles.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ id: 'owner' }),
        expect.objectContaining({
          id: 'deployer',
          capabilities: expect.arrayContaining([
            expect.objectContaining({
              resource: 'hub.deployment',
              actions: expect.arrayContaining([
                'deploy',
                'rollback',
                'redeploy',
              ]),
            }),
          ]),
        }),
      ]),
    });

    const members = await request('/members?sort=name');
    await expect(members.json()).resolves.toMatchObject({
      data: [
        expect.objectContaining({
          email: 'owner@example.com',
          status: 'active',
          roles: expect.arrayContaining(['owner']),
        }),
      ],
      meta: { total: 1 },
    });

    const audit = await request(
      `/audit-logs?applicationId=${encodeURIComponent(application.id)}&sort=-createdAt`,
    );
    await expect(audit.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          action: 'application.created',
          application: expect.objectContaining({ id: application.id }),
        }),
      ]),
    });
    const csv = await request(
      `/audit-logs.csv?applicationId=${encodeURIComponent(application.id)}&sort=-createdAt`,
    );
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(await csv.text()).toContain('application.created');

    const settings = await request('/settings');
    expect(settings.headers.get('etag')).toBe('"rev-1"');
    await expect(settings.json()).resolves.toMatchObject({
      data: {
        releaseRetention: { automaticCleanupEnabled: false },
        readOnly: {
          sourceStorage: 'local',
          releaseStorage: 'local',
          hostMode: 'unavailable',
          environmentCount: 1,
        },
      },
    });
    const updateSettings = await request('/settings', {
      method: 'PATCH',
      headers: { 'if-match': '"rev-1"' },
      body: JSON.stringify({ audit: { retentionDays: 180 } }),
    });
    expect(updateSettings.headers.get('etag')).toBe('"rev-2"');
    await expect(updateSettings.json()).resolves.toMatchObject({
      data: { audit: { retentionDays: 180 } },
    });

    const storage = await request('/storage');
    await expect(storage.json()).resolves.toMatchObject({
      data: {
        filesystem: expect.objectContaining({ usedBytes: expect.any(Number) }),
        categories: expect.arrayContaining([
          expect.objectContaining({ key: 'sourceRepositories' }),
          expect.objectContaining({ key: 'releaseArtifacts' }),
        ]),
      },
    });
    const cleanupPlan = await request('/storage/cleanup-plan?limit=1&offset=0');
    await expect(cleanupPlan.json()).resolves.toMatchObject({
      data: {
        totalReclaimableBytes: 0,
        candidates: [],
        protectedCounts: expect.objectContaining({
          activeRelease: 0,
          deploymentReference: 0,
          pinned: 0,
        }),
        measuredAt: expect.any(String),
      },
      meta: { total: 0, limit: 1, offset: 0 },
    });
  });

  it('publishes, queries, pins and unpins releases without exposing storage paths', async () => {
    const create = await request('/apps', {
      method: 'POST',
      headers: { 'idempotency-key': 'create-published' },
      body: JSON.stringify({ slug: 'published', name: 'Published' }),
    });
    const application = (await create.json()).data;
    const fixture = await createReleaseArchive(
      temporaryRoot,
      application.slug,
      application.repository.headCommit,
    );

    const createUpload = await request(
      `/apps/${application.id}/release-uploads`,
      {
        method: 'POST',
        headers: { 'idempotency-key': 'publish-1.0.0' },
        body: JSON.stringify(fixture.input),
      },
    );
    expect(createUpload.status).toBe(201);
    const upload = (await createUpload.json()).data;
    expect(upload).toMatchObject({
      applicationId: application.id,
      status: 'created',
      upload: {
        method: 'PUT',
        auth: { mode: 'hub-bearer' },
        headers: { 'Content-Type': 'application/gzip' },
      },
    });
    expect(JSON.stringify(upload)).not.toContain('storageKey');

    const content = await request(`/release-uploads/${upload.id}/content`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/gzip',
        'content-length': String(fixture.archive.byteLength),
      },
      body: fixture.archive,
    });
    expect(content.status).toBe(204);

    const complete = await request(`/release-uploads/${upload.id}/complete`, {
      method: 'POST',
      body: '{}',
    });
    expect(complete.status).toBe(202);
    const completed = await waitForUpload(upload.id);
    expect(completed).toMatchObject({
      status: 'completed',
      release: {
        version: '1.0.0',
        sourceCommit: application.repository.headCommit,
      },
    });
    expect(JSON.stringify(completed)).not.toContain('storageKey');

    const releases = await request(
      `/apps/${application.id}/releases?query=1.0&sort=-createdAt`,
    );
    expect(releases.status).toBe(200);
    const releasePage = await releases.json();
    expect(releasePage.meta).toMatchObject({ total: 1 });
    expect(releasePage.data).toHaveLength(1);
    expect(releasePage.data[0]).toMatchObject({
      id: completed.release.id,
      version: '1.0.0',
      retention: { pinned: false },
    });
    expect(JSON.stringify(releasePage)).not.toContain('storageKey');

    const detail = await request(
      `/apps/${application.id}/releases/${completed.release.id}`,
    );
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({
      data: { id: completed.release.id, retention: { pinned: false } },
    });

    const pin = await request(
      `/apps/${application.id}/releases/${completed.release.id}/pin`,
      { method: 'POST', body: '{}' },
    );
    await expect(pin.json()).resolves.toMatchObject({
      data: { retention: { pinned: true } },
      meta: { idempotent: false },
    });
    const unpin = await request(
      `/apps/${application.id}/releases/${completed.release.id}/unpin`,
      { method: 'POST', body: '{}' },
    );
    await expect(unpin.json()).resolves.toMatchObject({
      data: { retention: { pinned: false } },
      meta: { idempotent: false },
    });
    const retentionAudits = await request(
      `/audit-logs?applicationId=${encodeURIComponent(application.id)}&action=release.pinned&action=release.unpinned&sort=createdAt`,
    );
    await expect(retentionAudits.json()).resolves.toMatchObject({
      data: [
        expect.objectContaining({
          action: 'release.pinned',
          resourceId: completed.release.id,
        }),
        expect.objectContaining({
          action: 'release.unpinned',
          resourceId: completed.release.id,
        }),
      ],
      meta: { total: 2 },
    });

    const deploymentResponse = await request(
      `/apps/${application.id}/deployments`,
      {
        method: 'POST',
        headers: { 'idempotency-key': 'deploy-published-1.0.0' },
        body: JSON.stringify({
          targetReleaseId: completed.release.id,
          type: 'deploy',
        }),
      },
    );
    expect(deploymentResponse.status).toBe(202);
    const deploymentPayload = await deploymentResponse.json();
    expect(deploymentPayload.data).toMatchObject({
      applicationId: application.id,
      type: 'deploy',
      status: 'queued',
      failure: null,
    });
    expect(deploymentPayload.data).not.toHaveProperty('idempotencyKey');
    expect(deploymentPayload.data).not.toHaveProperty('hostOperationId');
    expect(deploymentPayload.data).not.toHaveProperty('failureCode');
    const deployment = await waitForDeployment(deploymentPayload.data.id);
    expect(deployment).toMatchObject({
      status: 'failed',
      failure: { code: expect.any(String), message: expect.any(String) },
    });

    const deploymentList = await request(
      `/deployments?applicationId=${encodeURIComponent(application.id)}&status=failed&type=deploy&query=Published&sort=-finishedAt`,
    );
    await expect(deploymentList.json()).resolves.toMatchObject({
      data: [{ id: deployment.id, status: 'failed', type: 'deploy' }],
      meta: { total: 1 },
    });
    const deploymentAudits = await request(
      `/audit-logs?applicationId=${encodeURIComponent(application.id)}&action=deployment.requested&action=deployment.failed`,
    );
    await expect(deploymentAudits.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ action: 'deployment.requested' }),
        expect.objectContaining({ action: 'deployment.failed' }),
      ]),
    });
  });

  it('projects the active release and removes legacy release registration', async () => {
    const create = await request('/apps', {
      method: 'POST',
      headers: { 'idempotency-key': 'create-release-projection' },
      body: JSON.stringify({
        slug: 'release-projection',
        name: 'Release projection',
      }),
    });
    const application = (await create.json()).data;
    const database = createHubDatabase({ filename: databasePath });
    await database.ready;
    const store = new HubStore(database.connection);
    const active = await store.createRelease(
      application.id,
      {
        version: '1.0.0',
        checksum: 'sha256:active',
        manifest: { source: { commit: 'active-commit' } },
        storageKey: 'private/active/path',
        sourceCommit: 'active-commit',
      },
      application.createdBy,
    );
    await store.setActiveRelease(application.id, active.release.id);
    const latest = await store.createRelease(
      application.id,
      {
        version: '2.0.0',
        checksum: 'sha256:latest',
        manifest: { source: { commit: 'latest-commit' } },
        storageKey: 'private/latest/path',
        sourceCommit: 'latest-commit',
      },
      application.createdBy,
    );
    await database.close();

    const list = await request('/apps?query=release-projection');
    const listPayload = await list.json();
    expect(listPayload.data).toHaveLength(1);
    expect(listPayload.data[0]).toMatchObject({
      id: application.id,
      activeRelease: {
        id: active.release.id,
        version: '1.0.0',
        sourceCommit: 'active-commit',
      },
      latestRelease: {
        id: latest.release.id,
        version: '2.0.0',
        sourceCommit: 'latest-commit',
      },
    });
    expect(listPayload.data[0]).not.toHaveProperty('activeReleaseId');
    expect(JSON.stringify(listPayload)).not.toContain('storageKey');

    const detail = await request(`/apps/${application.id}`);
    const detailPayload = await detail.json();
    expect(detailPayload.data).toMatchObject({
      activeRelease: {
        id: active.release.id,
        version: '1.0.0',
        checksum: 'sha256:active',
      },
    });
    expect(detailPayload.data).not.toHaveProperty('activeReleaseId');
    expect(JSON.stringify(detailPayload)).not.toContain('storageKey');

    const legacy = await request(`/apps/${application.id}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        version: '3.0.0',
        checksum: 'sha256:legacy',
        storageKey: 'private/legacy/path',
        manifest: {},
      }),
    });
    expect(legacy.status).toBe(404);
  });

  it('exports filtered deployments safely and rejects export pagination', async () => {
    const create = await request('/apps', {
      method: 'POST',
      headers: { 'idempotency-key': 'create-deployment-export' },
      body: JSON.stringify({ slug: 'deployment-export', name: '=Formula APP' }),
    });
    const application = (await create.json()).data;
    const database = createHubDatabase({ filename: databasePath });
    await database.ready;
    const store = new HubStore(database.connection);
    const release = await store.createRelease(
      application.id,
      {
        version: '1.0.0',
        checksum: 'sha256:deployment-export',
        manifest: {},
        sourceCommit: 'export-commit',
      },
      application.createdBy,
    );
    const failed = await store.createDeployment(
      application.id,
      { targetReleaseId: release.release.id, type: 'deploy' },
      application.createdBy,
    );
    await store.updateDeployment(failed.deployment.id, {
      status: 'failed',
      startedAt: '2026-08-25T01:00:00.000Z',
      finishedAt: '2026-08-25T01:01:00.000Z',
      failureCode: 'READINESS_FAILED',
      failureMessage: '=HYPERLINK("https://example.com")',
    });
    const cancelled = await store.createDeployment(
      application.id,
      { targetReleaseId: release.release.id, type: 'deploy' },
      application.createdBy,
    );
    await store.updateDeployment(cancelled.deployment.id, {
      status: 'cancelled',
      finishedAt: '2026-08-25T01:02:00.000Z',
    });
    await database.close();

    const anonymous = await app.request(
      `${browserOrigin}/hub/api/deployments.csv`,
    );
    expect(anonymous.status).toBe(401);

    const exported = await request(
      `/deployments.csv?applicationId=${encodeURIComponent(application.id)}&status=failed&type=deploy&query=Formula&sort=-finishedAt`,
    );
    expect(exported.status).toBe(200);
    expect(exported.headers.get('content-type')).toContain('text/csv');
    expect(exported.headers.get('content-disposition')).toContain(
      'hub-deployments.csv',
    );
    const csv = await exported.text();
    expect(csv).toContain(failed.deployment.id);
    expect(csv).not.toContain(cancelled.deployment.id);
    expect(csv).toContain("'=Formula APP");
    expect(csv).toContain("'=HYPERLINK");

    for (const query of ['limit=10', 'offset=10']) {
      const invalid = await request(`/deployments.csv?${query}`);
      expect(invalid.status).toBe(422);
      await expect(invalid.json()).resolves.toMatchObject({
        error: { code: 'VALIDATION_ERROR' },
      });
    }
  });

  it('enforces deployment CSV row and frequency limits', async () => {
    const create = await request('/apps', {
      method: 'POST',
      headers: { 'idempotency-key': 'create-deployment-export-limit' },
      body: JSON.stringify({
        slug: 'deployment-export-limit',
        name: 'Deployment export limit',
      }),
    });
    const application = (await create.json()).data;
    const database = createHubDatabase({ filename: databasePath });
    await database.ready;
    const store = new HubStore(database.connection);
    const release = await store.createRelease(
      application.id,
      {
        version: '1.0.0',
        checksum: 'sha256:deployment-export-limit',
        manifest: {},
      },
      application.createdBy,
    );
    const createdAt = new Date('2026-08-25T02:00:00.000Z');
    await database.connection.transaction(async (connection) => {
      for (let offset = 0; offset < 10_001; offset += 250) {
        const size = Math.min(250, 10_001 - offset);
        await connection.query
          .insertInto('hubDeployments')
          .values(
            Array.from({ length: size }, (_, index) => ({
              id: `export-limit-${offset + index}`,
              applicationId: application.id,
              environmentId: 'default',
              targetReleaseId: release.release.id,
              previousReleaseId: null,
              type: 'deploy' as const,
              status: 'failed' as const,
              requestedBy: application.createdBy,
              idempotencyKey: null,
              hostOperationId: null,
              startedAt: null,
              finishedAt: createdAt,
              failureCode: 'TEST_FAILURE',
              failureMessage: 'Expected test failure.',
              createdAt,
            })),
          )
          .execute();
      }
    });
    await database.close();

    const tooLarge = await request(
      `/deployments.csv?applicationId=${encodeURIComponent(application.id)}`,
    );
    expect(tooLarge.status).toBe(422);
    await expect(tooLarge.json()).resolves.toMatchObject({
      error: { code: 'EXPORT_LIMIT_EXCEEDED' },
    });

    let limited: Response | undefined;
    for (let index = 0; index < 10; index += 1) {
      const response = await request('/deployments.csv?query=no-match');
      if (response.status === 429) {
        limited = response;
        break;
      }
      expect(response.status).toBe(200);
    }
    expect(limited?.status).toBe(429);
    expect(Number(limited?.headers.get('retry-after'))).toBeGreaterThan(0);
    await expect(limited?.json()).resolves.toMatchObject({
      error: { code: 'RATE_LIMITED', retryable: true },
    });
  });

  it('rate-limits audit CSV export independently', async () => {
    let limited: Response | undefined;
    for (let index = 0; index < 10; index += 1) {
      const response = await request('/audit-logs.csv?sort=-createdAt');
      if (response.status === 429) {
        limited = response;
        break;
      }
      expect(response.status).toBe(200);
    }
    expect(limited?.status).toBe(429);
    expect(Number(limited?.headers.get('retry-after'))).toBeGreaterThan(0);
    await expect(limited?.json()).resolves.toMatchObject({
      error: { code: 'RATE_LIMITED', retryable: true },
    });
  });

  function request(
    pathname: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('cookie', cookie);
    if (init.method && init.method !== 'GET' && init.method !== 'HEAD') {
      headers.set('origin', browserOrigin);
      if (!headers.has('content-type'))
        headers.set('content-type', 'application/json');
    }
    return app.request(`${browserOrigin}/hub/api${pathname}`, {
      ...init,
      headers,
    });
  }

  async function waitForUpload(uploadId: string): Promise<Record<string, any>> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await request(`/release-uploads/${uploadId}`);
      const value = (await response.json()).data as Record<string, any>;
      if (value.status === 'completed' || value.status === 'failed')
        return value;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Release upload did not finish.');
  }

  async function waitForDeployment(
    deploymentId: string,
  ): Promise<Record<string, any>> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await request(`/deployments/${deploymentId}`);
      const value = (await response.json()).data as Record<string, any>;
      if (
        value.status === 'succeeded' ||
        value.status === 'failed' ||
        value.status === 'cancelled'
      ) {
        return value;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Deployment did not finish.');
  }
});

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
  const cookie = signIn.headers.get('set-cookie');
  expect(cookie).toBeTruthy();
  return cookie ?? '';
}

async function createRepositorySeed(root: string): Promise<string> {
  const worktree = path.join(root, 'seed-worktree');
  const bare = path.join(root, 'default-template.git');
  await mkdir(worktree, { recursive: true });
  await execFileAsync('git', ['init', '--initial-branch=main'], {
    cwd: worktree,
  });
  await writeFile(
    path.join(worktree, 'package.json'),
    `${JSON.stringify({ name: 'default-template', private: true }, null, 2)}\n`,
  );
  await execFileAsync('git', ['add', 'package.json'], { cwd: worktree });
  await execFileAsync('git', ['commit', '-m', 'Initial template'], {
    cwd: worktree,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'NocoBase',
      GIT_AUTHOR_EMAIL: 'support@nocobase.com',
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
      GIT_COMMITTER_NAME: 'NocoBase',
      GIT_COMMITTER_EMAIL: 'support@nocobase.com',
      GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    },
  });
  await execFileAsync('git', ['clone', '--bare', '--', worktree, bare]);
  return bare;
}

async function createReleaseArchive(
  root: string,
  slug: string,
  commit: string,
): Promise<{
  archive: Uint8Array;
  input: Record<string, unknown>;
}> {
  const artifact = path.join(root, `artifact-${slug}`);
  await mkdir(path.join(artifact, 'dist/server'), { recursive: true });
  await mkdir(path.join(artifact, 'dist/client'), { recursive: true });
  const manifest = {
    schemaVersion: 1,
    basePath: `/${slug}`,
    client: { rootDir: 'dist/client' },
    server: {
      entrypoint: 'dist/server/embedded.js',
      healthPath: '/api/healthz',
    },
    source: { commit },
  };
  await writeFile(
    path.join(artifact, 'nocobase-release.json'),
    `${JSON.stringify(manifest)}\n`,
  );
  await writeFile(
    path.join(artifact, 'dist/server/embedded.js'),
    'export default {};\n',
  );
  await writeFile(
    path.join(artifact, 'dist/client/index.html'),
    '<main>APP</main>',
  );
  const archivePath = path.join(root, `${slug}.tar.gz`);
  await execFileAsync('tar', ['-czf', archivePath, '-C', artifact, '.'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  const archive = await readFile(archivePath);
  return {
    archive,
    input: {
      version: '1.0.0',
      sourceCommit: commit,
      checksum: await computeReleaseArtifactChecksum(artifact),
      sizeBytes: await directorySize(artifact),
      archiveChecksum: `sha256:${createHash('sha256').update(archive).digest('hex')}`,
      archiveSizeBytes: archive.byteLength,
      archiveFormat: 'tar.gz',
      manifest,
    },
  };
}

async function directorySize(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    total += entry.isDirectory()
      ? await directorySize(entryPath)
      : (await stat(entryPath)).size;
  }
  return total;
}
