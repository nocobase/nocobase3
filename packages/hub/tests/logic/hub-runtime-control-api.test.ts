// @vitest-environment node

import { Auth } from '@nocobase/app-plugin-authentication';
import { AppRuntimeRegistry } from '@nocobase/app-host';
import { Hono } from 'hono';
import type { Knex } from 'knex';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import { createHubApi, type HubApi } from '../../server/hub/api.ts';
import { computeReleaseArtifactChecksum } from '../../server/hub/artifact-integrity.ts';
import {
  createHubDatabase,
  type HubDatabaseRuntime,
} from '../../server/hub/database.ts';
import { RuntimeSecretService } from '../../server/hub/runtime-secret-service.ts';
import { HubStore } from '../../server/hub/store.ts';

const origin = 'http://127.0.0.1:13224';
const authSecret = 'hub-runtime-control-test-secret-at-least-32-characters';
const encryptionKey = { key: Buffer.alloc(32, 6), keyId: 'runtime-test-key' };
const execFileAsync = promisify(execFile);

interface RuntimeFixture {
  readonly root: string;
  readonly database: HubDatabaseRuntime;
  readonly store: HubStore;
  readonly registry: AppRuntimeRegistry;
  readonly auth: Auth;
  readonly api: HubApi;
  readonly mounted: Hono;
  readonly cookie: string;
  readonly ownerId: string;
  readonly applicationId: string;
  readonly applicationSlug: string;
  readonly releaseId: string;
  setReadinessFailure(value: boolean): void;
}

const fixtures: RuntimeFixture[] = [];

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await fixture.api.close();
    await fixture.registry.destroyAll({ reason: 'test cleanup' });
    await fixture.database.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

describe('Hub Runtime control API', () => {
  it('validates empty bodies and makes start and stop naturally idempotent', async () => {
    const fixture = await createRuntimeFixture();

    const invalid = await request(fixture, '/runtime/start', {
      method: 'POST',
      body: JSON.stringify({ unexpected: true }),
    });
    expect(invalid.status).toBe(422);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });

    const started = await request(fixture, '/runtime/start', {
      method: 'POST',
      body: '{}',
    });
    expect(started.status).toBe(200);
    await expect(started.json()).resolves.toMatchObject({
      data: {
        state: 'running',
        releaseId: fixture.releaseId,
        url: expect.any(String),
      },
      meta: { idempotent: false },
    });
    await expect(
      fixture.store.connection.query
        .selectFrom('hubApplications')
        .select('desiredRuntimeState')
        .where('id', '=', fixture.applicationId)
        .executeTakeFirstOrThrow(),
    ).resolves.toMatchObject({ desiredRuntimeState: 'running' });

    const repeatedStart = await request(fixture, '/runtime/start', {
      method: 'POST',
      body: '{}',
    });
    await expect(repeatedStart.json()).resolves.toMatchObject({
      data: { state: 'running', releaseId: fixture.releaseId },
      meta: { idempotent: true },
    });

    await fixture.registry.evict(fixture.applicationSlug);
    const idle = await request(fixture, '/runtime', { method: 'GET' });
    await expect(idle.json()).resolves.toMatchObject({
      data: {
        state: 'idle',
        releaseId: fixture.releaseId,
        url: expect.any(String),
      },
    });
    await fixture.registry.ensureActive(fixture.applicationSlug);
    const coldStarted = await request(fixture, '/runtime', { method: 'GET' });
    await expect(coldStarted.json()).resolves.toMatchObject({
      data: {
        state: 'running',
        releaseId: fixture.releaseId,
        url: expect.any(String),
      },
    });

    const stopped = await request(fixture, '/runtime/stop', {
      method: 'POST',
      body: '{}',
    });
    await expect(stopped.json()).resolves.toMatchObject({
      data: { state: 'stopped', url: null },
      meta: { idempotent: false },
    });
    await expect(
      fixture.store.connection.query
        .selectFrom('hubApplications')
        .select('desiredRuntimeState')
        .where('id', '=', fixture.applicationId)
        .executeTakeFirstOrThrow(),
    ).resolves.toMatchObject({ desiredRuntimeState: 'stopped' });
    expect(fixture.registry.definition(fixture.applicationSlug)).toMatchObject({
      enabled: false,
    });
    await expect(
      fixture.registry.ensureActive(fixture.applicationSlug),
    ).rejects.toMatchObject({ status: 503, code: 'APP_STOPPED' });
    const stoppedApplication = await requestAbsolute(
      fixture,
      `/apps/${fixture.applicationId}`,
    );
    await expect(stoppedApplication.json()).resolves.toMatchObject({
      data: { links: { open: null } },
    });

    const repeatedStop = await request(fixture, '/runtime/stop', {
      method: 'POST',
      body: '{}',
    });
    await expect(repeatedStop.json()).resolves.toMatchObject({
      data: { state: 'stopped' },
      meta: { idempotent: true },
    });
  });

  it('keeps a stopped application disabled when Hub reconciles after restart', async () => {
    const fixture = await createRuntimeFixture();
    await request(fixture, '/runtime/start', { method: 'POST', body: '{}' });
    await request(fixture, '/runtime/stop', { method: 'POST', body: '{}' });

    const restartedRegistry = new AppRuntimeRegistry({
      startEvictionLoop: false,
      resolveFactory: () => () => ({
        fetch: () => Response.json({ ok: true }),
      }),
    });
    const restartedApi = createHubApi({
      database: fixture.database,
      auth: fixture.auth,
      bootstrapAuth: fixture.auth,
      registry: restartedRegistry,
      releaseRoot: path.join(fixture.root, 'releases'),
      runtimeSecretEncryptionKey: encryptionKey,
      appName: 'hub',
      publicBasePath: '/hub',
      authoritativeOrigin: origin,
      appPublicOrigin: 'http://127.0.0.1:3000',
    });

    try {
      await restartedApi.ready;
      expect(
        restartedRegistry.snapshot(fixture.applicationSlug),
      ).toBeUndefined();
      expect(
        restartedRegistry.definition(fixture.applicationSlug),
      ).toMatchObject({
        enabled: false,
        release: { releaseId: fixture.releaseId },
      });
      await expect(
        restartedRegistry.ensureActive(fixture.applicationSlug),
      ).rejects.toMatchObject({ status: 503, code: 'APP_STOPPED' });
    } finally {
      await restartedApi.close();
      await restartedRegistry.destroyAll({ reason: 'restart test cleanup' });
    }
  });

  it('keeps stopped applications disabled across secret rotation and archive restore', async () => {
    const fixture = await createRuntimeFixture();
    await request(fixture, '/runtime/start', { method: 'POST', body: '{}' });
    await request(fixture, '/runtime/stop', { method: 'POST', body: '{}' });

    const rotation = await request(fixture, '/runtime-secret/rotate', {
      method: 'POST',
      headers: { 'idempotency-key': 'rotate-while-stopped' },
      body: '{}',
    });
    expect(rotation.status).toBe(200);
    expect(fixture.registry.definition(fixture.applicationSlug)).toMatchObject({
      enabled: false,
    });

    const current = await requestAbsolute(
      fixture,
      `/apps/${fixture.applicationId}`,
    );
    const archived = await requestAbsolute(
      fixture,
      `/apps/${fixture.applicationId}/archive`,
      {
        method: 'POST',
        headers: { 'if-match': current.headers.get('etag') ?? '' },
        body: '{}',
      },
    );
    expect(archived.status).toBe(200);
    expect(
      fixture.registry.definition(fixture.applicationSlug),
    ).toBeUndefined();

    const restored = await requestAbsolute(
      fixture,
      `/apps/${fixture.applicationId}/restore`,
      {
        method: 'POST',
        headers: { 'if-match': archived.headers.get('etag') ?? '' },
        body: '{}',
      },
    );
    expect(restored.status).toBe(200);
    await expect(restored.json()).resolves.toMatchObject({
      data: { links: { open: null } },
    });
    expect(fixture.registry.definition(fixture.applicationSlug)).toMatchObject({
      enabled: false,
    });
    await expect(
      fixture.registry.ensureActive(fixture.applicationSlug),
    ).rejects.toMatchObject({ code: 'APP_STOPPED', status: 503 });
  });

  it('compensates Host state when persisting a runtime transition fails', async () => {
    const fixture = await createRuntimeFixture();
    await request(fixture, '/runtime/start', { method: 'POST', body: '{}' });
    const knex = await fixture.database.connection.client<Knex>();
    const tables = await knex('sqlite_master')
      .select<{ name: string }[]>('name')
      .where('type', '=', 'table');
    const applicationsTable = tables.find(
      ({ name }) =>
        name.replaceAll('_', '').toLowerCase() === 'hubapplications',
    )?.name;
    expect(applicationsTable).toBeTruthy();

    await knex.raw(`
      CREATE TRIGGER reject_runtime_stop_state
      BEFORE UPDATE OF desired_runtime_state ON "${applicationsTable?.replaceAll('"', '""')}"
      WHEN NEW.desired_runtime_state = 'stopped'
      BEGIN
        SELECT RAISE(ABORT, 'simulated runtime stop persistence failure');
      END
    `);
    const failedStop = await request(fixture, '/runtime/stop', {
      method: 'POST',
      body: '{}',
    });
    expect(failedStop.status).toBe(500);
    expect(fixture.registry.snapshot(fixture.applicationSlug)).toMatchObject({
      state: 'active',
    });
    expect(fixture.registry.definition(fixture.applicationSlug)).toMatchObject({
      enabled: true,
    });

    await knex.raw('DROP TRIGGER reject_runtime_stop_state');
    const stopped = await request(fixture, '/runtime/stop', {
      method: 'POST',
      body: '{}',
    });
    expect(stopped.status).toBe(200);

    await knex.raw(`
      CREATE TRIGGER reject_runtime_start_state
      BEFORE UPDATE OF desired_runtime_state ON "${applicationsTable?.replaceAll('"', '""')}"
      WHEN NEW.desired_runtime_state = 'running'
      BEGIN
        SELECT RAISE(ABORT, 'simulated runtime start persistence failure');
      END
    `);
    const failedStart = await request(fixture, '/runtime/start', {
      method: 'POST',
      body: '{}',
    });
    expect(failedStart.status).toBe(500);
    expect(fixture.registry.snapshot(fixture.applicationSlug)).toBeUndefined();
    expect(fixture.registry.definition(fixture.applicationSlug)).toMatchObject({
      enabled: false,
    });
    await expect(
      fixture.registry.ensureActive(fixture.applicationSlug),
    ).rejects.toMatchObject({ code: 'APP_STOPPED', status: 503 });
  });

  it('rejects archived applications and unfinished deployments', async () => {
    const archived = await createRuntimeFixture();
    await archived.store.connection.query
      .updateTable('hubApplications')
      .set({ status: 'archived' })
      .where('id', '=', archived.applicationId)
      .execute();

    for (const action of ['start', 'stop', 'restart'] as const) {
      const response = await request(archived, `/runtime/${action}`, {
        method: 'POST',
        headers:
          action === 'restart'
            ? { 'idempotency-key': 'archived-restart' }
            : undefined,
        body: '{}',
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'APPLICATION_ARCHIVED' },
      });
    }

    const deploying = await createRuntimeFixture();
    await deploying.store.createDeployment(
      deploying.applicationId,
      { targetReleaseId: deploying.releaseId },
      deploying.ownerId,
    );
    const conflict = await request(deploying, '/runtime/start', {
      method: 'POST',
      body: '{}',
    });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: 'RUNTIME_CONTROL_CONFLICT', retryable: true },
    });
  });

  it('requires an idempotency key for restart and replays the same result', async () => {
    const fixture = await createRuntimeFixture();
    const missing = await request(fixture, '/runtime/restart', {
      method: 'POST',
      body: '{}',
    });
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: 'INVALID_IDEMPOTENCY_KEY' },
    });

    const first = await request(fixture, '/runtime/restart', {
      method: 'POST',
      headers: { 'idempotency-key': 'restart-once' },
      body: '{}',
    });
    const firstPayload = (await first.json()) as {
      data: { runtimeId: string };
      meta: { idempotent: boolean; previousState: string };
    };
    expect(firstPayload).toMatchObject({
      data: { state: 'running', releaseId: fixture.releaseId },
      meta: { idempotent: false, previousState: 'idle' },
    });
    const runtimeId = firstPayload.data.runtimeId;

    const replay = await request(fixture, '/runtime/restart', {
      method: 'POST',
      headers: { 'idempotency-key': 'restart-once' },
      body: '{}',
    });
    await expect(replay.json()).resolves.toMatchObject({
      data: { runtimeId },
      meta: { idempotent: true, previousState: 'idle' },
    });
  });

  it('rotates a secret idempotently and records a failed rotation', async () => {
    const fixture = await createRuntimeFixture();

    const invalid = await request(fixture, '/runtime-secret/rotate', {
      method: 'POST',
      headers: { 'idempotency-key': 'rotate-invalid' },
      body: JSON.stringify({ unexpected: true }),
    });
    expect(invalid.status).toBe(422);

    const first = await request(fixture, '/runtime-secret/rotate', {
      method: 'POST',
      headers: { 'idempotency-key': 'rotate-once' },
      body: '{}',
    });
    await expect(first.json()).resolves.toMatchObject({
      data: { version: 2 },
      meta: { idempotent: false },
    });
    const replay = await request(fixture, '/runtime-secret/rotate', {
      method: 'POST',
      headers: { 'idempotency-key': 'rotate-once' },
      body: '{}',
    });
    await expect(replay.json()).resolves.toMatchObject({
      data: { version: 2 },
      meta: { idempotent: true },
    });

    await request(fixture, '/runtime/start', { method: 'POST', body: '{}' });
    fixture.setReadinessFailure(true);
    const failed = await request(fixture, '/runtime-secret/rotate', {
      method: 'POST',
      headers: { 'idempotency-key': 'rotate-fails' },
      body: '{}',
    });
    expect(failed.status).toBeGreaterThanOrEqual(400);

    const audits = await requestAbsolute(
      fixture,
      `/audit-logs?applicationId=${encodeURIComponent(fixture.applicationId)}&action=runtimeSecret.rotationFailed`,
    );
    await expect(audits.json()).resolves.toMatchObject({
      data: [
        expect.objectContaining({
          action: 'runtimeSecret.rotationFailed',
          result: 'failure',
          failureCode: expect.any(String),
        }),
      ],
      meta: { total: 1 },
    });
  });

  it('recovers stale idempotency work and pending rotations before other recovery', async () => {
    const fixture = await createRuntimeFixture();
    const service = new RuntimeSecretService(
      fixture.database.connection,
      encryptionKey,
    );
    const operationId = rotationOperationId(
      fixture.ownerId,
      fixture.applicationId,
      'recover-rotation',
    );
    await service.beginRotation(fixture.applicationId, operationId);
    const now = new Date();
    await fixture.database.connection.query
      .insertInto('hubIdempotencyRecords')
      .values({
        id: crypto.randomUUID(),
        identityKey: `actor:${fixture.ownerId}`,
        actorId: fixture.ownerId,
        credentialId: null,
        endpoint: 'POST /apps/:id/runtime-secret/rotate',
        scopeKey: fixture.applicationId,
        idempotencyKey: 'recover-rotation',
        requestHash: createHash('sha256').update('{}').digest('hex'),
        responseResource: null,
        status: 'running',
        expiresAt: new Date(now.getTime() + 86_400_000),
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const recovered = createHubApi({
      database: fixture.database,
      auth: fixture.auth,
      bootstrapAuth: fixture.auth,
      registry: fixture.registry,
      releaseRoot: path.join(fixture.root, 'releases'),
      runtimeSecretEncryptionKey: encryptionKey,
      appName: 'hub',
      publicBasePath: '/hub',
      authoritativeOrigin: origin,
      appPublicOrigin: 'http://127.0.0.1:3000',
    });
    await recovered.ready;
    await expect(service.summary(fixture.applicationId)).resolves.toMatchObject(
      {
        version: 2,
      },
    );
    await expect(
      fixture.database.connection.query
        .selectFrom('hubRuntimeSecrets')
        .select('id')
        .where('applicationId', '=', fixture.applicationId)
        .where('state', '=', 'pending')
        .execute(),
    ).resolves.toEqual([]);
    await expect(
      fixture.database.connection.query
        .selectFrom('hubIdempotencyRecords')
        .select('id')
        .where('status', '=', 'running')
        .execute(),
    ).resolves.toEqual([]);
    await recovered.close();
  });
});

async function createRuntimeFixture(): Promise<RuntimeFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'hub-runtime-control-api-'));
  const repositorySeedPath = await createRepositorySeed(root);
  const database = createHubDatabase({
    filename: path.join(root, 'hub.sqlite'),
  });
  await database.ready;
  let failReadiness = false;
  const registry = new AppRuntimeRegistry({
    startEvictionLoop: false,
    resolveFactory: () => {
      const unhealthy = failReadiness;
      return () => ({
        fetch: () => Response.json({ ok: !unhealthy }),
      });
    },
  });
  const auth = new Auth({
    connection: database.connection,
    baseURL: origin,
    basePath: '/hub/api/auth',
    secret: authSecret,
    emailAndPassword: { enabled: true, autoSignIn: false },
  });
  const api = createHubApi({
    database,
    auth,
    bootstrapAuth: auth,
    registry,
    releaseRoot: path.join(root, 'releases'),
    runtimeSecretEncryptionKey: encryptionKey,
    appName: 'hub',
    publicBasePath: '/hub',
    authoritativeOrigin: origin,
    appPublicOrigin: 'http://127.0.0.1:3000',
    sourceRoot: path.join(root, 'sources'),
    repositorySeedPath,
  });
  const mounted = new Hono();
  mounted.route('/hub/api', api);
  await api.ready;
  const owner = await mounted.request(`${origin}/hub/api/setup/owner`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({
      email: 'runtime-owner@example.com',
      password: 'correct horse battery staple',
      name: 'Runtime Owner',
      username: 'runtimeowner',
    }),
  });
  const ownerPayload = (await owner.json()) as {
    data: { user: { id: string } };
  };
  const ownerId = ownerPayload.data.user.id;
  const signIn = await mounted.request(`${origin}/hub/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({
      email: 'runtime-owner@example.com',
      password: 'correct horse battery staple',
    }),
  });
  const cookie = signIn.headers.get('set-cookie') ?? '';
  const store = new HubStore(database.connection);
  const application = await store.createApplication(
    { slug: `runtime-${crypto.randomUUID().slice(0, 8)}`, name: 'Runtime APP' },
    ownerId,
  );
  const storageKey = `${application.id}/release-1`;
  const releaseDirectory = path.join(root, 'releases', storageKey);
  await mkdir(path.join(releaseDirectory, 'dist/server'), { recursive: true });
  await writeFile(
    path.join(releaseDirectory, 'dist/server/embedded.js'),
    'export default {};\n',
  );
  const { release } = await store.createRelease(
    application.id,
    {
      version: '1.0.0',
      checksum: await computeReleaseArtifactChecksum(releaseDirectory),
      manifest: {
        server: {
          entrypoint: 'dist/server/embedded.js',
          healthPath: '/healthz',
        },
      },
      storageKey,
    },
    ownerId,
  );
  await store.setActiveRelease(application.id, release.id);
  await new RuntimeSecretService(
    database.connection,
    encryptionKey,
  ).ensureInitial(application.id);
  const fixture: RuntimeFixture = {
    root,
    database,
    store,
    registry,
    auth,
    api,
    mounted,
    cookie,
    ownerId,
    applicationId: application.id,
    applicationSlug: application.slug,
    releaseId: release.id,
    setReadinessFailure(value: boolean): void {
      failReadiness = value;
    },
  };
  fixtures.push(fixture);
  return fixture;
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
    `${JSON.stringify({ name: 'runtime-test-template', private: true })}\n`,
  );
  await execFileAsync('git', ['add', 'package.json'], { cwd: worktree });
  await execFileAsync('git', ['commit', '-m', 'Initial template'], {
    cwd: worktree,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'NocoBase',
      GIT_AUTHOR_EMAIL: 'support@nocobase.com',
      GIT_COMMITTER_NAME: 'NocoBase',
      GIT_COMMITTER_EMAIL: 'support@nocobase.com',
    },
  });
  await execFileAsync('git', ['clone', '--bare', '--', worktree, bare]);
  return bare;
}

function request(
  fixture: RuntimeFixture,
  suffix: string,
  init: RequestInit,
): Promise<Response> {
  return requestAbsolute(
    fixture,
    `/apps/${fixture.applicationId}${suffix}`,
    init,
  );
}

function requestAbsolute(
  fixture: RuntimeFixture,
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('cookie', fixture.cookie);
  if (init.method && init.method !== 'GET' && init.method !== 'HEAD') {
    headers.set('origin', origin);
    if (!headers.has('content-type'))
      headers.set('content-type', 'application/json');
  }
  return fixture.mounted.request(`${origin}/hub/api${pathname}`, {
    ...init,
    headers,
  });
}

function rotationOperationId(
  actorId: string,
  applicationId: string,
  idempotencyKey: string,
): string {
  return `runtime-secret-${createHash('sha256')
    .update(`actor:${actorId}\0${applicationId}\0${idempotencyKey}`)
    .digest('hex')}`;
}
