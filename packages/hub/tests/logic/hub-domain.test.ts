// @vitest-environment node

import { Auth } from '@nocobase/app-plugin-authentication';
import { AppRuntimeRegistry } from '@nocobase/app-host';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Knex } from 'knex';

import { createHubApi } from '../../server/hub/api.ts';
import { computeReleaseArtifactChecksum } from '../../server/hub/artifact-integrity.ts';
import { HubAuthorization } from '../../server/hub/authorization.ts';
import {
  createHubDatabase,
  type HubDatabaseRuntime,
} from '../../server/hub/database.ts';
import { HubDomainError, HubStore } from '../../server/hub/store.ts';
import { LocalHostAdapter } from '../../server/hub/local-host-adapter.ts';
import { RuntimeSecretService } from '../../server/hub/runtime-secret-service.ts';

const databases: HubDatabaseRuntime[] = [];
const registries: AppRuntimeRegistry[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    registries
      .splice(0)
      .map((registry) => registry.destroyAll({ reason: 'test cleanup' })),
  );
  await Promise.all(databases.splice(0).map((database) => database.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createStore(): Promise<{
  database: HubDatabaseRuntime;
  store: HubStore;
}> {
  const database = createHubDatabase({ filename: ':memory:' });
  databases.push(database);
  await database.ready;
  return { database, store: new HubStore(database.connection) };
}

async function createApplication(store: HubStore) {
  return store.createApplication(
    {
      slug: 'inventory',
      name: 'Inventory',
      description: 'Inventory application',
    },
    'user-1',
  );
}

describe('HubStore', () => {
  it('enforces SemVer releases and makes matching checksums idempotent', async () => {
    const { store } = await createStore();
    const application = await createApplication(store);

    await expect(
      store.createRelease(
        application.id,
        {
          version: 'local',
          checksum: 'sha256:bad',
          manifest: {},
        },
        'user-1',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RELEASE_VERSION', status: 422 });

    const first = await store.createRelease(
      application.id,
      {
        version: '1.2.3',
        checksum: 'sha256:abc',
        manifest: { format: 1 },
      },
      'user-1',
    );
    const repeated = await store.createRelease(
      application.id,
      {
        version: '1.2.3',
        checksum: 'sha256:abc',
        manifest: { ignoredOnIdempotentReplay: true },
      },
      'user-1',
    );

    expect(first.created).toBe(true);
    expect(repeated).toEqual({ release: first.release, created: false });

    await expect(
      store.createRelease(
        application.id,
        {
          version: '1.2.3',
          checksum: 'sha256:different',
          manifest: {},
        },
        'user-1',
      ),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
  });

  it('persists the first deployment event and prevents parallel app deployments', async () => {
    const { store } = await createStore();
    const application = await createApplication(store);
    const { release } = await store.createRelease(
      application.id,
      {
        version: '1.0.0',
        checksum: 'sha256:abc',
        manifest: {},
      },
      'user-1',
    );

    const first = await store.createDeployment(
      application.id,
      {
        targetReleaseId: release.id,
        idempotencyKey: 'deploy-1',
      },
      'user-1',
    );
    const replay = await store.createDeployment(
      application.id,
      {
        targetReleaseId: release.id,
        idempotencyKey: 'deploy-1',
      },
      'user-1',
    );

    expect(first.created).toBe(true);
    expect(replay).toEqual({ deployment: first.deployment, created: false });
    await expect(
      store.listDeploymentEvents(first.deployment.id),
    ).resolves.toEqual([
      expect.objectContaining({
        sequence: 1,
        status: 'queued',
        type: 'queued',
      }),
    ]);

    await expect(
      store.createDeployment(
        application.id,
        { targetReleaseId: release.id, idempotencyKey: 'deploy-2' },
        'user-1',
      ),
    ).rejects.toMatchObject({ code: 'DEPLOYMENT_IN_PROGRESS', status: 409 });
  });

  it('validates rollback and redeploy targets against deployment history', async () => {
    const { database, store } = await createStore();
    const application = await createApplication(store);
    const first = await store.createRelease(
      application.id,
      { version: '1.0.0', checksum: 'sha256:first', manifest: {} },
      'user-1',
    );
    const second = await store.createRelease(
      application.id,
      { version: '2.0.0', checksum: 'sha256:second', manifest: {} },
      'user-1',
    );

    await expect(
      store.createDeployment(
        application.id,
        {
          targetReleaseId: first.release.id,
          type: 'rollback',
          idempotencyKey: 'rollback-never-active',
        },
        'user-1',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 422 });

    await database.connection.query
      .updateTable('hubApplications')
      .set({ activeReleaseId: first.release.id })
      .where('id', '=', application.id)
      .execute();

    await expect(
      store.createDeployment(
        application.id,
        {
          targetReleaseId: second.release.id,
          type: 'redeploy',
          idempotencyKey: 'redeploy-not-active',
        },
        'user-1',
      ),
    ).rejects.toMatchObject({ code: 'ACTIVE_RELEASE_CHANGED', status: 409 });

    const redeploy = await store.createDeployment(
      application.id,
      {
        targetReleaseId: first.release.id,
        type: 'redeploy',
        idempotencyKey: 'redeploy-active',
      },
      'user-1',
    );
    expect(redeploy.deployment.type).toBe('redeploy');
  });

  it('rejects deployment creation for an archived application', async () => {
    const { database, store } = await createStore();
    const application = await createApplication(store);
    const { release } = await store.createRelease(
      application.id,
      { version: '1.0.0', checksum: 'sha256:archived', manifest: {} },
      'user-1',
    );
    await database.connection.query
      .updateTable('hubApplications')
      .set({ status: 'archived' })
      .where('id', '=', application.id)
      .execute();

    await expect(
      store.createDeployment(
        application.id,
        { targetReleaseId: release.id, type: 'deploy' },
        'user-1',
      ),
    ).rejects.toMatchObject({ code: 'APPLICATION_ARCHIVED', status: 409 });
  });

  it('rolls back the active release, terminal state, and reservation when the success event cannot be persisted', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'nocobase-hub-atomic-success-'),
    );
    temporaryDirectories.push(directory);
    const database = createHubDatabase({
      filename: path.join(directory, 'hub.sqlite'),
    });
    databases.push(database);
    await database.ready;
    const store = new HubStore(database.connection);
    const application = await createApplication(store);
    const { release } = await store.createRelease(
      application.id,
      {
        version: '1.0.0',
        checksum: 'sha256:atomic-success',
        manifest: {},
      },
      'user-1',
    );
    const { deployment } = await store.createDeployment(
      application.id,
      { targetReleaseId: release.id },
      'user-1',
    );
    await store.updateDeployment(deployment.id, { status: 'draining' });

    const knex = await database.connection.client<Knex>();
    const tables = await knex('sqlite_master')
      .select<{ name: string }[]>('name')
      .where('type', '=', 'table');
    const eventTable = tables.find(
      ({ name }) =>
        name.replaceAll('_', '').toLowerCase() === 'hubdeploymentevents',
    )?.name;
    expect(eventTable).toBeTruthy();
    await knex.raw(`
      CREATE TRIGGER reject_succeeded_deployment_event
      BEFORE INSERT ON "${eventTable?.replaceAll('"', '""')}"
      WHEN NEW.type = 'succeeded'
      BEGIN
        SELECT RAISE(ABORT, 'simulated success event failure');
      END
    `);

    await expect(
      store.completeDeploymentSuccess(deployment.id, {
        hostOperationId: deployment.id,
        runtimeId: application.id,
        recovered: false,
      }),
    ).rejects.toThrow('simulated success event failure');
    await expect(
      store.requireApplication(application.id),
    ).resolves.toMatchObject({ activeReleaseId: null });
    await expect(store.requireDeployment(deployment.id)).resolves.toMatchObject(
      {
        status: 'draining',
        finishedAt: null,
      },
    );
    await expect(
      store.listDeploymentEvents(deployment.id),
    ).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'succeeded' })]),
    );
    await expect(
      store.createDeployment(
        application.id,
        { targetReleaseId: release.id },
        'user-1',
      ),
    ).rejects.toMatchObject({ code: 'DEPLOYMENT_IN_PROGRESS', status: 409 });
  });

  it('does not let a stale deployment overwrite a newer active release', async () => {
    const { store } = await createStore();
    const application = await createApplication(store);
    const { release: previousRelease } = await store.createRelease(
      application.id,
      { version: '1.0.0', checksum: 'sha256:previous', manifest: {} },
      'user-1',
    );
    const { release: targetRelease } = await store.createRelease(
      application.id,
      { version: '2.0.0', checksum: 'sha256:target', manifest: {} },
      'user-1',
    );
    const { release: newerRelease } = await store.createRelease(
      application.id,
      { version: '3.0.0', checksum: 'sha256:newer', manifest: {} },
      'user-1',
    );
    await store.setActiveRelease(application.id, previousRelease.id);
    const { deployment } = await store.createDeployment(
      application.id,
      { targetReleaseId: targetRelease.id },
      'user-1',
    );
    await store.setActiveRelease(application.id, newerRelease.id);

    await expect(
      store.completeDeploymentSuccess(deployment.id, {
        hostOperationId: deployment.id,
        runtimeId: application.id,
        recovered: false,
      }),
    ).rejects.toMatchObject({ code: 'DEPLOYMENT_SUPERSEDED', status: 409 });
    await expect(
      store.requireApplication(application.id),
    ).resolves.toMatchObject({ activeReleaseId: newerRelease.id });
    await expect(store.requireDeployment(deployment.id)).resolves.toMatchObject(
      {
        status: 'queued',
        finishedAt: null,
      },
    );
  });

  it('keeps a successful deployment terminal and releases its reservation exactly once', async () => {
    const { store } = await createStore();
    const application = await createApplication(store);
    const { release } = await store.createRelease(
      application.id,
      { version: '1.0.0', checksum: 'sha256:terminal', manifest: {} },
      'user-1',
    );
    const { deployment } = await store.createDeployment(
      application.id,
      { targetReleaseId: release.id },
      'user-1',
    );

    const first = await store.completeDeploymentSuccess(deployment.id, {
      hostOperationId: deployment.id,
      runtimeId: application.id,
      recovered: false,
    });
    const replay = await store.completeDeploymentSuccess(deployment.id, {
      hostOperationId: deployment.id,
      runtimeId: application.id,
      recovered: false,
    });

    expect(first.status).toBe('succeeded');
    expect(replay).toEqual(first);
    await expect(
      store.updateDeployment(deployment.id, { status: 'checking' }),
    ).rejects.toMatchObject({
      code: 'DEPLOYMENT_ALREADY_TERMINAL',
      status: 409,
    });
    await expect(store.listDeploymentEvents(deployment.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'succeeded', status: 'succeeded' }),
      ]),
    );
    expect(
      (await store.listDeploymentEvents(deployment.id)).filter(
        (event) => event.type === 'succeeded',
      ),
    ).toHaveLength(1);
    await expect(
      store.createDeployment(
        application.id,
        { targetReleaseId: release.id },
        'user-1',
      ),
    ).resolves.toMatchObject({ created: true });
  });

  it('projects persisted active releases for Host startup without creating deployments', async () => {
    const { database, store } = await createStore();
    const application = await createApplication(store);
    const releaseRoot = await mkdtemp(
      path.join(tmpdir(), 'nocobase-hub-recovery-'),
    );
    temporaryDirectories.push(releaseRoot);
    const storageKey = `${application.id}/release-2.0.0`;
    const entrypointDirectory = path.join(
      releaseRoot,
      storageKey,
      'dist/server',
    );
    await mkdir(entrypointDirectory, { recursive: true });
    await writeFile(
      path.join(entrypointDirectory, 'embedded.js'),
      'export default {};',
    );
    const { release } = await store.createRelease(
      application.id,
      {
        version: '2.0.0',
        checksum: await computeReleaseArtifactChecksum(
          path.join(releaseRoot, storageKey),
        ),
        manifest: {},
        storageKey,
      },
      'user-1',
    );
    await store.setActiveRelease(application.id, release.id);
    const encryptionKey = {
      key: Buffer.alloc(32, 4),
      keyId: 'runtime-recovery-key',
    };
    const runtimeSecrets = new RuntimeSecretService(
      database.connection,
      encryptionKey,
    );
    await runtimeSecrets.ensureInitial(application.id);
    const expectedRuntimeSecret = await runtimeSecrets.getActive(
      application.id,
    );

    await expect(store.listActiveApplicationReleases()).resolves.toEqual([
      {
        application: expect.objectContaining({
          id: application.id,
          activeReleaseId: release.id,
        }),
        release: expect.objectContaining({ id: release.id, version: '2.0.0' }),
      },
    ]);
    await expect(store.listDeployments()).resolves.toMatchObject({
      items: [],
      total: 0,
    });

    let activatedConfig: unknown;
    const registry = new AppRuntimeRegistry({
      startEvictionLoop: false,
      resolveFactory: () => (scope) => {
        activatedConfig = scope.config;
        return {
          fetch: () => Response.json({ ok: true }),
        };
      },
    });
    registries.push(registry);
    const auth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-domain-recovery-secret-at-least-32-characters',
    });
    const api = createHubApi({
      database,
      auth,
      bootstrapAuth: auth,
      registry,
      releaseRoot,
      runtimeSecretEncryptionKey: encryptionKey,
      appName: 'hub',
      publicBasePath: '/hub',
    });

    await api.ready;
    expect(registry.snapshot(application.slug)?.releaseId).toBe(release.id);
    expect(activatedConfig).toEqual({
      authSecret: expectedRuntimeSecret.secret,
    });
    await expect(store.listDeployments()).resolves.toMatchObject({
      items: [],
      total: 0,
    });
  });

  it('keeps Hub readable when an active release exists but the Host is unavailable', async () => {
    const { database, store } = await createStore();
    const application = await createApplication(store);
    const { release } = await store.createRelease(
      application.id,
      {
        version: '2.1.0',
        checksum: 'sha256:host-offline',
        manifest: {},
        storageKey: `${application.id}/release-2.1.0`,
      },
      'user-1',
    );
    await store.setActiveRelease(application.id, release.id);
    const auth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-host-offline-secret-at-least-32-characters',
    });
    const api = createHubApi({
      database,
      auth,
      bootstrapAuth: auth,
      appName: 'hub',
      publicBasePath: '/hub',
    });

    await expect(api.ready).resolves.toBeUndefined();
    await expect(
      store.requireApplication(application.id),
    ).resolves.toMatchObject({ activeReleaseId: release.id });
    await api.close();
  });
});

describe('LocalHostAdapter', () => {
  it('rejects an HTML fallback even when the readiness endpoint returns 200', async () => {
    const { store } = await createStore();
    const application = await createApplication(store);
    const releaseRoot = await mkdtemp(
      path.join(tmpdir(), 'nocobase-hub-readiness-contract-'),
    );
    temporaryDirectories.push(releaseRoot);
    const storageKey = `${application.id}/release-1.0.0`;
    const serverDirectory = path.join(releaseRoot, storageKey, 'dist/server');
    await mkdir(serverDirectory, { recursive: true });
    await writeFile(path.join(serverDirectory, 'embedded.js'), 'export {};');
    const { release } = await store.createRelease(
      application.id,
      {
        version: '1.0.0',
        checksum: await computeReleaseArtifactChecksum(
          path.join(releaseRoot, storageKey),
        ),
        manifest: {},
        storageKey,
      },
      'user-1',
    );
    const { deployment } = await store.createDeployment(
      application.id,
      { targetReleaseId: release.id },
      'user-1',
    );
    const registry = new AppRuntimeRegistry({
      startEvictionLoop: false,
      resolveFactory: () => () => ({
        fetch: () =>
          new Response('<!doctype html><title>SPA fallback</title>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }),
      }),
    });
    registries.push(registry);
    const adapter = new LocalHostAdapter({ registry, releaseRoot });

    await expect(
      adapter.deploy({ application, release, deployment }),
    ).rejects.toMatchObject({ code: 'APP_READINESS_FAILED' });
    expect(registry.snapshot(application.slug)).toBeUndefined();
  });

  it('commits a release only after a real local Host deployment succeeds', async () => {
    const { database, store } = await createStore();
    const application = await createApplication(store);
    const releaseRoot = await mkdtemp(
      path.join(tmpdir(), 'nocobase-hub-local-host-'),
    );
    temporaryDirectories.push(releaseRoot);
    const storageKey = `${application.id}/release-1.0.0`;
    const serverDirectory = path.join(releaseRoot, storageKey, 'dist/server');
    await mkdir(serverDirectory, { recursive: true });
    await writeFile(path.join(serverDirectory, 'embedded.js'), 'export {};');
    const { release } = await store.createRelease(
      application.id,
      {
        version: '1.0.0',
        checksum: await computeReleaseArtifactChecksum(
          path.join(releaseRoot, storageKey),
        ),
        manifest: {},
        storageKey,
      },
      'user-1',
    );
    const { deployment } = await store.createDeployment(
      application.id,
      { targetReleaseId: release.id },
      'user-1',
    );
    let activatedConfig: unknown;
    const registry = new AppRuntimeRegistry({
      startEvictionLoop: false,
      resolveFactory: (definition) => (scope) => {
        activatedConfig = scope.config;
        return {
          fetch: (request) => {
            const pathname = new URL(request.url).pathname;
            return pathname === '/healthz'
              ? Response.json({ ok: true })
              : Response.json({ version: definition.desiredVersion });
          },
        };
      },
    });
    registries.push(registry);
    const auth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-local-host-secret-at-least-32-characters',
    });
    const api = createHubApi({
      database,
      auth,
      bootstrapAuth: auth,
      registry,
      releaseRoot,
      appAuthSecret: 'shared-runtime-auth-secret-at-least-32-characters',
      appName: 'hub',
      publicBasePath: '/hub',
    });

    await api.ready;
    await expect(store.getDeployment(deployment.id)).resolves.toMatchObject({
      status: 'succeeded',
      failureCode: null,
    });
    await expect(
      store.requireApplication(application.id),
    ).resolves.toMatchObject({ activeReleaseId: release.id });
    expect(activatedConfig).toEqual({
      authSecret: 'shared-runtime-auth-secret-at-least-32-characters',
    });
    expect(registry.definition(application.slug)?.config).toBeUndefined();
    expect(registry.snapshot(application.slug)?.releaseId).toBe(release.id);
    await api.close();
  });

  it('keeps the prior active release when the next artifact is missing', async () => {
    const { database, store } = await createStore();
    const application = await createApplication(store);
    const releaseRoot = await mkdtemp(
      path.join(tmpdir(), 'nocobase-hub-old-release-'),
    );
    temporaryDirectories.push(releaseRoot);
    const firstStorageKey = `${application.id}/release-1.0.0`;
    const firstServerDirectory = path.join(
      releaseRoot,
      firstStorageKey,
      'dist/server',
    );
    await mkdir(firstServerDirectory, { recursive: true });
    await writeFile(
      path.join(firstServerDirectory, 'embedded.js'),
      'export {};',
    );
    const { release: firstRelease } = await store.createRelease(
      application.id,
      {
        version: '1.0.0',
        checksum: await computeReleaseArtifactChecksum(
          path.join(releaseRoot, firstStorageKey),
        ),
        manifest: {},
        storageKey: firstStorageKey,
      },
      'user-1',
    );
    const { deployment: firstDeployment } = await store.createDeployment(
      application.id,
      { targetReleaseId: firstRelease.id },
      'user-1',
    );
    const registry = new AppRuntimeRegistry({
      startEvictionLoop: false,
      resolveFactory: (definition) => () => ({
        fetch: () =>
          Response.json({ ok: true, version: definition.desiredVersion }),
      }),
    });
    registries.push(registry);
    const auth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-old-release-secret-at-least-32-characters',
    });
    const createApi = () =>
      createHubApi({
        database,
        auth,
        bootstrapAuth: auth,
        registry,
        releaseRoot,
        appName: 'hub',
        publicBasePath: '/hub',
      });
    const firstApi = createApi();
    await firstApi.ready;
    await expect(
      store.getDeployment(firstDeployment.id),
    ).resolves.toMatchObject({ status: 'succeeded' });
    await firstApi.close();

    const { release: missingRelease } = await store.createRelease(
      application.id,
      {
        version: '2.0.0',
        checksum: 'sha256:missing-release',
        manifest: {},
        storageKey: `${application.id}/missing`,
      },
      'user-1',
    );
    const { deployment: failedDeployment } = await store.createDeployment(
      application.id,
      { targetReleaseId: missingRelease.id },
      'user-1',
    );
    const recoveryApi = createApi();
    await recoveryApi.ready;

    await expect(
      store.getDeployment(failedDeployment.id),
    ).resolves.toMatchObject({
      status: 'failed',
      failureCode: 'RELEASE_SERVER_ENTRYPOINT_MISSING',
    });
    await expect(
      store.requireApplication(application.id),
    ).resolves.toMatchObject({ activeReleaseId: firstRelease.id });
    expect(registry.snapshot(application.slug)?.releaseId).toBe(
      firstRelease.id,
    );
    await recoveryApi.close();
  });

  it('does not publish a first-release definition when activation fails', async () => {
    const { database, store } = await createStore();
    const application = await createApplication(store);
    const releaseRoot = await mkdtemp(
      path.join(tmpdir(), 'nocobase-hub-first-release-'),
    );
    temporaryDirectories.push(releaseRoot);
    const storageKey = `${application.id}/release-1.0.0`;
    const serverDirectory = path.join(releaseRoot, storageKey, 'dist/server');
    await mkdir(serverDirectory, { recursive: true });
    await writeFile(path.join(serverDirectory, 'embedded.js'), 'export {};');
    const { release } = await store.createRelease(
      application.id,
      {
        version: '1.0.0',
        checksum: await computeReleaseArtifactChecksum(
          path.join(releaseRoot, storageKey),
        ),
        manifest: {},
        storageKey,
      },
      'user-1',
    );
    const { deployment } = await store.createDeployment(
      application.id,
      { targetReleaseId: release.id },
      'user-1',
    );
    const registry = new AppRuntimeRegistry({
      startEvictionLoop: false,
      resolveFactory: () => {
        throw new Error('candidate activation failed');
      },
    });
    registries.push(registry);
    const adapter = new LocalHostAdapter({ registry, releaseRoot });

    await expect(
      adapter.deploy({ application, release, deployment }),
    ).rejects.toBeDefined();
    expect(registry.has(application.slug)).toBe(false);
    expect(registry.snapshot(application.slug)).toBeUndefined();

    const auth = new Auth({
      connection: store.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-host-error-secret-at-least-32-characters',
    });
    const api = createHubApi({
      database,
      auth,
      bootstrapAuth: auth,
      registry,
      releaseRoot,
      appName: 'hub',
      publicBasePath: '/hub',
    });
    await api.ready;
    await expect(store.getDeployment(deployment.id)).resolves.toMatchObject({
      status: 'failed',
      failureCode: 'APP_CREATE_FAILED',
    });
    expect(registry.has(application.slug)).toBe(false);
    await api.close();
  });

  it('rejects missing and escaping artifacts without changing Host state', async () => {
    const { store } = await createStore();
    const application = await createApplication(store);
    const releaseRoot = await mkdtemp(
      path.join(tmpdir(), 'nocobase-hub-invalid-release-'),
    );
    temporaryDirectories.push(releaseRoot);
    const registry = new AppRuntimeRegistry({ startEvictionLoop: false });
    registries.push(registry);
    const adapter = new LocalHostAdapter({ registry, releaseRoot });

    const otherApplicationServer = path.join(
      releaseRoot,
      'other-application/1.0.0/dist/server',
    );
    await mkdir(otherApplicationServer, { recursive: true });
    await writeFile(
      path.join(otherApplicationServer, 'embedded.js'),
      'export {};',
    );

    for (const [storageKey, version, expectedCode] of [
      [
        `${application.id}/missing`,
        '2.0.0',
        'RELEASE_SERVER_ENTRYPOINT_MISSING',
      ],
      ['../escape', '3.0.0', 'INVALID_RELEASE_PATH'],
      [
        `${application.id}/../other-application/1.0.0`,
        '4.0.0',
        'INVALID_RELEASE_STORAGE_KEY',
      ],
    ] as const) {
      const { release } = await store.createRelease(
        application.id,
        {
          version,
          checksum: `sha256:${expectedCode}`,
          manifest: {},
          storageKey,
        },
        'user-1',
      );
      const deployment = {
        id: crypto.randomUUID(),
        applicationId: application.id,
        environmentId: 'default',
        targetReleaseId: release.id,
        previousReleaseId: null,
        type: 'deploy' as const,
        status: 'queued' as const,
        requestedBy: 'user-1',
        idempotencyKey: null,
        hostOperationId: null,
        startedAt: null,
        finishedAt: null,
        failureCode: null,
        failureMessage: null,
        createdAt: new Date().toISOString(),
      };

      await expect(
        adapter.deploy({ application, release, deployment }),
      ).rejects.toMatchObject({ code: expectedCode });
      expect(registry.has(application.slug)).toBe(false);
    }
  });
});

describe('HubAuthorization', () => {
  it('separates artifact publishing, deployment, runtime control, and governance capabilities', async () => {
    const { store } = await createStore();
    const authorization = new HubAuthorization(store);

    await store.assignRole('developer-1', 'developer');
    await store.assignRole('deployer-1', 'deployer');
    await store.assignRole('admin-1', 'admin');

    await expect(
      authorization.require('developer-1', {
        resource: 'hub.release',
        action: 'create',
      }),
    ).resolves.toBeUndefined();
    await expect(
      authorization.require('developer-1', {
        resource: 'hub.deployment',
        action: 'deploy',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    for (const action of ['deploy', 'rollback', 'redeploy'] as const) {
      await expect(
        authorization.require('deployer-1', {
          resource: 'hub.deployment',
          action,
        }),
      ).resolves.toBeUndefined();
    }
    await expect(
      authorization.require('deployer-1', {
        resource: 'hub.runtime',
        action: 'control',
      }),
    ).resolves.toBeUndefined();
    await expect(
      authorization.require('deployer-1', {
        resource: 'hub.release',
        action: 'create',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      authorization.require('admin-1', {
        resource: 'hub.runtimeSecret',
        action: 'rotate',
      }),
    ).resolves.toBeUndefined();
    await expect(
      authorization.require('admin-1', {
        resource: 'hub.auditLog',
        action: 'export',
      }),
    ).resolves.toBeUndefined();
  });

  it('keeps role capabilities server-side and application scopes private', async () => {
    const { store } = await createStore();
    const authorization = new HubAuthorization(store);

    await store.assignRole('owner-1', 'owner');
    await store.assignRole('viewer-1', 'viewer');

    await expect(
      authorization.require('owner-1', {
        resource: 'hub.app',
        action: 'create',
      }),
    ).resolves.toBeUndefined();
    await expect(
      authorization.require('viewer-1', {
        resource: 'hub.app',
        action: 'create',
      }),
    ).rejects.toBeInstanceOf(HubDomainError);
    await expect(
      authorization.require('viewer-1', {
        resource: 'hub.app',
        action: 'read',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('Hub deployment API authorization', () => {
  it('authorizes an application deployer using the requested deployment type', async () => {
    const { database, store } = await createStore();
    const application = await createApplication(store);
    const { release } = await store.createRelease(
      application.id,
      { version: '1.0.0', checksum: 'sha256:api-deployer', manifest: {} },
      'owner-1',
    );
    await store.assignRole('deployer-1', 'deployer', application.id);
    const auth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-deployer-api-secret-at-least-32-characters',
    });
    vi.spyOn(auth, 'getSession').mockResolvedValue({
      user: {
        id: 'deployer-1',
        name: 'APP Deployer',
        email: 'deployer@example.com',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: {
        id: 'session-1',
        userId: 'deployer-1',
        token: 'session-token',
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const api = createHubApi({
      database,
      auth,
      bootstrapAuth: auth,
      appName: 'hub',
      publicBasePath: '/hub',
    });

    const response = await api.request(
      `http://localhost/apps/${application.id}/deployments`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'app-deployer-deploy',
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          targetReleaseId: release.id,
          type: 'deploy',
        }),
      },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      data: { type: 'deploy', requestedBy: 'deployer-1' },
    });
    await api.close();
  });

  it('requires Idempotency-Key in the header and rejects the legacy body field', async () => {
    const { database, store } = await createStore();
    const application = await createApplication(store);
    const { release } = await store.createRelease(
      application.id,
      { version: '1.0.0', checksum: 'sha256:header-only', manifest: {} },
      'owner-1',
    );
    await store.assignRole('owner-1', 'owner');
    const auth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-header-api-secret-at-least-32-characters',
    });
    vi.spyOn(auth, 'getSession').mockResolvedValue({
      user: {
        id: 'owner-1',
        name: 'Owner',
        email: 'owner@example.com',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: {
        id: 'session-owner',
        userId: 'owner-1',
        token: 'owner-session-token',
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const api = createHubApi({
      database,
      auth,
      bootstrapAuth: auth,
      appName: 'hub',
      publicBasePath: '/hub',
    });

    const response = await api.request(
      `http://localhost/apps/${application.id}/deployments`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          targetReleaseId: release.id,
          type: 'deploy',
          idempotencyKey: 'legacy-body-key',
        }),
      },
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        issues: [{ path: 'idempotencyKey', code: 'unknown_field' }],
      },
    });
    await api.close();
  });
});

describe('createHubApi', () => {
  it('initializes exactly one owner, closes public signup, and returns envelopes', async () => {
    const { database } = await createStore();
    const auth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-domain-test-secret-at-least-32-characters',
      emailAndPassword: { enabled: true, disableSignUp: true },
      advanced: {
        cookiePrefix: 'hub-domain-test',
        defaultCookieAttributes: { path: '/hub' },
      },
    });
    const bootstrapAuth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-domain-test-secret-at-least-32-characters',
    });
    const api = createHubApi({
      database,
      auth,
      bootstrapAuth,
      appName: 'hub',
      publicBasePath: '/hub',
    });
    const mounted = new Hono();
    mounted.route('/hub/api', api);

    const statusBefore = await mounted.request(
      'http://localhost/hub/api/setup/status',
    );
    expect(statusBefore.status).toBe(200);
    await expect(statusBefore.json()).resolves.toMatchObject({
      data: { setupRequired: true },
      requestId: expect.any(String),
    });

    const owner = await mounted.request(
      'http://localhost/hub/api/setup/owner',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          email: 'owner@example.com',
          password: 'correct horse battery staple',
          name: 'Hub Owner',
          username: 'owner',
        }),
      },
    );
    expect(owner.status).toBe(201);

    const secondOwner = await mounted.request(
      'http://localhost/hub/api/setup/owner',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          email: 'second@example.com',
          password: 'correct horse battery staple',
          name: 'Second Owner',
          username: 'second',
        }),
      },
    );
    expect(secondOwner.status).toBe(409);

    const publicSignup = await mounted.request(
      'http://localhost/hub/api/auth/sign-up/email',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          email: 'public@example.com',
          password: 'correct horse battery staple',
          name: 'Public User',
        }),
      },
    );
    expect(publicSignup.status).toBe(403);
    await expect(publicSignup.json()).resolves.toMatchObject({
      error: { code: 'PUBLIC_SIGNUP_DISABLED' },
      requestId: expect.any(String),
    });
  });

  it('does not expose an authentication provider 5xx while setting up the owner', async () => {
    const { database, store } = await createStore();
    const sensitiveCode = 'SQLITE_OPEN_FAILED_AT_SECRET_PATH';
    const sensitiveMessage = '/private/runtime/hub.sqlite could not be opened';
    const bootstrapAuth = {
      handler: async () =>
        Response.json(
          { code: sensitiveCode, message: sensitiveMessage },
          { status: 500 },
        ),
    } as unknown as Auth;
    const api = createHubApi({
      database,
      auth: bootstrapAuth,
      bootstrapAuth,
      appName: 'hub',
      publicBasePath: '/hub',
    });
    const mounted = new Hono();
    mounted.route('/hub/api', api);

    const response = await mounted.request(
      'http://localhost/hub/api/setup/owner',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          email: 'owner-error@example.com',
          password: 'correct horse battery staple',
          name: 'Owner Error',
        }),
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected internal error occurred.',
        retryable: true,
      },
    });
    await expect(store.isSetupRequired()).resolves.toBe(true);
    await api.close();
  });

  it("conceals applications and deployments outside an actor's app scope", async () => {
    const { database, store } = await createStore();
    const allowedApplication = await createApplication(store);
    const concealedApplication = await store.createApplication(
      { slug: 'finance', name: 'Finance' },
      'owner-1',
    );
    const { release } = await store.createRelease(
      concealedApplication.id,
      { version: '1.0.0', checksum: 'sha256:finance', manifest: {} },
      'owner-1',
    );
    const { deployment } = await store.createDeployment(
      concealedApplication.id,
      { targetReleaseId: release.id },
      'owner-1',
    );
    const now = new Date();
    await database.connection.query
      .insertInto('hubAppScopes')
      .values({
        id: crypto.randomUUID(),
        userId: 'scoped-user',
        applicationId: allowedApplication.id,
        actions: JSON.stringify([
          'hub.app:read',
          'hub.release:read',
          'hub.deployment:read',
        ]),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const scopedAuth = {
      getSession: async () => ({
        user: {
          id: 'scoped-user',
          name: 'Scoped User',
          email: 'scoped@example.com',
        },
        session: {},
      }),
    } as unknown as Auth;
    const api = createHubApi(
      {
        database,
        auth: scopedAuth,
        bootstrapAuth: scopedAuth,
        appName: 'hub',
        publicBasePath: '/hub',
      },
      { recoverDeployments: false },
    );
    const mounted = new Hono();
    mounted.route('/hub/api', api);

    const allowed = await mounted.request(
      `http://localhost/hub/api/apps/${allowedApplication.id}`,
    );
    expect(allowed.status).toBe(200);

    for (const [path, code] of [
      [`apps/${concealedApplication.id}`, 'APPLICATION_NOT_FOUND'],
      ['apps/missing-application', 'APPLICATION_NOT_FOUND'],
      [`apps/${concealedApplication.id}/releases`, 'APPLICATION_NOT_FOUND'],
      [`apps/${concealedApplication.id}/deployments`, 'APPLICATION_NOT_FOUND'],
      [`deployments/${deployment.id}`, 'DEPLOYMENT_NOT_FOUND'],
      [`deployments/${deployment.id}/events`, 'DEPLOYMENT_NOT_FOUND'],
      ['deployments/missing-deployment', 'DEPLOYMENT_NOT_FOUND'],
    ] as const) {
      const response = await mounted.request(
        `http://localhost/hub/api/${path}`,
      );
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: { code },
      });
    }
    await api.close();
  });

  it('reserves owner setup before signup so concurrent requests cannot create orphan users', async () => {
    const { database } = await createStore();
    const auth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-domain-concurrency-secret-at-least-32-characters',
      emailAndPassword: { enabled: true, disableSignUp: true },
    });
    const bootstrapAuth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-domain-concurrency-secret-at-least-32-characters',
    });
    const firstApi = createHubApi({
      database,
      auth,
      bootstrapAuth,
      appName: 'hub',
      publicBasePath: '/hub',
    });
    const secondApi = createHubApi({
      database,
      auth,
      bootstrapAuth,
      appName: 'hub',
      publicBasePath: '/hub',
    });
    const firstMounted = new Hono();
    const secondMounted = new Hono();
    firstMounted.route('/hub/api', firstApi);
    secondMounted.route('/hub/api', secondApi);
    const makeRequest = (app: Hono, email: string) =>
      app.request('http://localhost/hub/api/setup/owner', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          email,
          password: 'correct horse battery staple',
          name: email,
          username: email.split('@')[0],
        }),
      });

    const responses = await Promise.all([
      makeRequest(firstMounted, 'first@example.com'),
      makeRequest(secondMounted, 'second@example.com'),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const users = await database.connection.query
      .selectFrom('user')
      .select('id')
      .execute();
    expect(users).toHaveLength(1);
  });

  it('rewrites bootstrap signup from the current embedded API mount', async () => {
    const { database } = await createStore();
    const auth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/api/auth',
      secret: 'hub-domain-embedded-secret-at-least-32-characters',
      emailAndPassword: { enabled: true, disableSignUp: true },
    });
    const bootstrapAuth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/api/auth',
      secret: 'hub-domain-embedded-secret-at-least-32-characters',
    });
    const api = createHubApi({
      database,
      auth,
      bootstrapAuth,
      appName: 'hub',
      publicBasePath: '/hub',
    });
    const embedded = new Hono();
    embedded.route('/api', api);

    const response = await embedded.request(
      'http://localhost/api/setup/owner',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          email: 'embedded@example.com',
          password: 'correct horse battery staple',
          name: 'Embedded Owner',
          username: 'embedded',
        }),
      },
    );
    expect(response.status).toBe(201);
  });

  it('does not expose legacy local artifact release registration', async () => {
    const { database, store } = await createStore();
    const releaseRoot = await mkdtemp(
      path.join(tmpdir(), 'nocobase-hub-release-verification-'),
    );
    temporaryDirectories.push(releaseRoot);
    const auth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-release-verification-secret-at-least-32-characters',
      emailAndPassword: { enabled: true, disableSignUp: true },
    });
    const bootstrapAuth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-release-verification-secret-at-least-32-characters',
    });
    const api = createHubApi({
      database,
      auth,
      bootstrapAuth,
      releaseRoot,
      appName: 'hub',
      publicBasePath: '/hub',
    });
    const mounted = new Hono();
    mounted.route('/hub/api', api);

    const owner = await mounted.request(
      'http://localhost/hub/api/setup/owner',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          email: 'release-verification@example.com',
          password: 'correct horse battery staple',
          name: 'Release Verification Owner',
        }),
      },
    );
    expect(owner.status).toBe(201);
    const signIn = await mounted.request(
      'http://localhost/hub/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          email: 'release-verification@example.com',
          password: 'correct horse battery staple',
        }),
      },
    );
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.get('set-cookie') ?? '';
    const appResponse = await mounted.request('http://localhost/hub/api/apps', {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({
        slug: 'verified-release-app',
        name: 'Verified Release App',
      }),
    });
    expect(appResponse.status).toBe(201);
    const application = ((await appResponse.json()) as { data: { id: string } })
      .data;
    const releaseUrl = `http://localhost/hub/api/apps/${application.id}/releases`;
    const legacy = await mounted.request(releaseUrl, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({
        version: '1.0.0',
        checksum: `sha256:${'0'.repeat(64)}`,
        manifest: {},
        storageKey: 'verified-release-app/missing',
      }),
    });
    expect(legacy.status).toBe(404);

    await expect(store.listReleases(application.id)).resolves.toMatchObject({
      items: [],
      total: 0,
    });
    await api.close();
  });

  it('fails an indeterminate in-flight deployment safely during startup recovery', async () => {
    const { database, store } = await createStore();
    const application = await createApplication(store);
    const { release } = await store.createRelease(
      application.id,
      { version: '4.0.0', checksum: 'sha256:restart', manifest: {} },
      'user-1',
    );
    const { deployment } = await store.createDeployment(
      application.id,
      { targetReleaseId: release.id, idempotencyKey: 'restart-deployment' },
      'user-1',
    );
    await store.updateDeployment(deployment.id, {
      status: 'activating',
      startedAt: new Date().toISOString(),
    });
    const auth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-domain-restart-secret-at-least-32-characters',
      emailAndPassword: { enabled: true, disableSignUp: true },
    });
    const bootstrapAuth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-domain-restart-secret-at-least-32-characters',
    });
    const api = createHubApi({
      database,
      auth,
      bootstrapAuth,
      appName: 'hub',
      publicBasePath: '/hub',
    });

    await api.ready;
    await expect(store.getDeployment(deployment.id)).resolves.toMatchObject({
      status: 'failed',
      failureCode: 'HUB_RESTARTED_DURING_DEPLOYMENT',
    });
    await expect(store.listDeploymentEvents(deployment.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'failed',
          status: 'failed',
          details: { code: 'HUB_RESTARTED_DURING_DEPLOYMENT' },
        }),
      ]),
    );
  });

  it('does not mistake a same-release redeploy for a completed Host operation', async () => {
    const { database, store } = await createStore();
    const application = await createApplication(store);
    const { release } = await store.createRelease(
      application.id,
      { version: '4.0.1', checksum: 'sha256:redeploy', manifest: {} },
      'user-1',
    );
    await store.setActiveRelease(application.id, release.id);
    const { deployment } = await store.createDeployment(
      application.id,
      { targetReleaseId: release.id },
      'user-1',
    );
    expect(deployment.previousReleaseId).toBe(release.id);
    await store.updateDeployment(deployment.id, {
      status: 'activating',
      startedAt: new Date().toISOString(),
    });
    const auth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-domain-redeploy-secret-at-least-32-characters',
    });
    const api = createHubApi({
      database,
      auth,
      bootstrapAuth: auth,
      appName: 'hub',
      publicBasePath: '/hub',
    });

    await api.ready;
    await expect(store.getDeployment(deployment.id)).resolves.toMatchObject({
      status: 'failed',
      failureCode: 'HUB_RESTARTED_DURING_DEPLOYMENT',
      hostOperationId: null,
    });
    await api.close();
  });

  it('converges a restarted deployment to success when its target release is active', async () => {
    const { database, store } = await createStore();
    const application = await createApplication(store);
    const { release } = await store.createRelease(
      application.id,
      { version: '4.1.0', checksum: 'sha256:recovered', manifest: {} },
      'user-1',
    );
    const { deployment } = await store.createDeployment(
      application.id,
      { targetReleaseId: release.id },
      'user-1',
    );
    await store.updateDeployment(deployment.id, {
      status: 'checking',
      hostOperationId: deployment.id,
      startedAt: new Date().toISOString(),
    });
    await store.setActiveRelease(application.id, release.id);
    const auth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-domain-recovered-secret-at-least-32-characters',
    });
    const api = createHubApi({
      database,
      auth,
      bootstrapAuth: auth,
      appName: 'hub',
      publicBasePath: '/hub',
    });

    await api.ready;
    await expect(store.getDeployment(deployment.id)).resolves.toMatchObject({
      status: 'succeeded',
      failureCode: null,
      hostOperationId: deployment.id,
    });
    await expect(store.listDeploymentEvents(deployment.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'succeeded',
          status: 'succeeded',
          details: { activeReleaseId: release.id, recovered: true },
        }),
      ]),
    );
    await api.close();
  });

  it('retries the control-plane commit after Host has activated the target', async () => {
    const { database, store } = await createStore();
    const application = await createApplication(store);
    const releaseRoot = await mkdtemp(
      path.join(tmpdir(), 'nocobase-hub-post-host-commit-'),
    );
    temporaryDirectories.push(releaseRoot);
    const storageKey = `${application.id}/release-1.0.0`;
    const serverDirectory = path.join(releaseRoot, storageKey, 'dist/server');
    await mkdir(serverDirectory, { recursive: true });
    await writeFile(path.join(serverDirectory, 'embedded.js'), 'export {};');
    const { release } = await store.createRelease(
      application.id,
      {
        version: '1.0.0',
        checksum: await computeReleaseArtifactChecksum(
          path.join(releaseRoot, storageKey),
        ),
        manifest: {},
        storageKey,
      },
      'user-1',
    );
    const { deployment } = await store.createDeployment(
      application.id,
      { targetReleaseId: release.id },
      'user-1',
    );
    const registry = new AppRuntimeRegistry({
      startEvictionLoop: false,
      resolveFactory: () => () => ({
        fetch: () => Response.json({ ok: true }),
      }),
    });
    registries.push(registry);
    const completeDeploymentSuccess = vi
      .spyOn(HubStore.prototype, 'completeDeploymentSuccess')
      .mockRejectedValueOnce(new Error('transient database failure'));
    const auth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-domain-post-host-secret-at-least-32-characters',
    });
    const api = createHubApi({
      database,
      auth,
      bootstrapAuth: auth,
      registry,
      releaseRoot,
      appName: 'hub',
      publicBasePath: '/hub',
    });

    try {
      await api.ready;
    } finally {
      completeDeploymentSuccess.mockRestore();
    }
    await expect(store.getDeployment(deployment.id)).resolves.toMatchObject({
      status: 'succeeded',
      failureCode: null,
      hostOperationId: deployment.id,
    });
    await expect(
      store.requireApplication(application.id),
    ).resolves.toMatchObject({ activeReleaseId: release.id });
    expect(registry.snapshot(application.slug)?.releaseId).toBe(release.id);
    await api.close();
  });

  it('persists a safe message for an unexpected deployment failure', async () => {
    const { database, store } = await createStore();
    const application = await createApplication(store);
    const releaseRoot = await mkdtemp(
      path.join(tmpdir(), 'nocobase-hub-safe-deployment-error-'),
    );
    temporaryDirectories.push(releaseRoot);
    const storageKey = `${application.id}/release-1.0.0`;
    const serverDirectory = path.join(releaseRoot, storageKey, 'dist/server');
    await mkdir(serverDirectory, { recursive: true });
    await writeFile(path.join(serverDirectory, 'embedded.js'), 'export {};');
    const { release } = await store.createRelease(
      application.id,
      {
        version: '1.0.0',
        checksum: await computeReleaseArtifactChecksum(
          path.join(releaseRoot, storageKey),
        ),
        manifest: {},
        storageKey,
      },
      'user-1',
    );
    const { deployment } = await store.createDeployment(
      application.id,
      { targetReleaseId: release.id },
      'user-1',
    );
    const sensitiveMessage = `database failed at ${releaseRoot}/secret.sqlite`;
    const registry = {
      snapshot: () => undefined,
      definition: () => undefined,
      deploy: async () => {
        throw new Error(sensitiveMessage);
      },
    } as unknown as AppRuntimeRegistry;
    const auth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-safe-deployment-error-at-least-32-characters',
    });
    const api = createHubApi({
      database,
      auth,
      bootstrapAuth: auth,
      registry,
      releaseRoot,
      appName: 'hub',
      publicBasePath: '/hub',
    });

    await api.ready;
    await expect(store.getDeployment(deployment.id)).resolves.toMatchObject({
      status: 'failed',
      failureCode: 'INTERNAL_ERROR',
      failureMessage: 'An unexpected internal error occurred.',
    });
    await expect(store.listDeploymentEvents(deployment.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'failed',
          message: 'An unexpected internal error occurred.',
          details: { code: 'INTERNAL_ERROR' },
        }),
      ]),
    );
    await api.close();
  });

  it('uses a database reservation to converge concurrent deployment creation', async () => {
    const { store } = await createStore();
    const application = await createApplication(store);
    const { release } = await store.createRelease(
      application.id,
      { version: '3.0.0', checksum: 'sha256:concurrent', manifest: {} },
      'user-1',
    );
    const results = await Promise.allSettled([
      store.createDeployment(
        application.id,
        { targetReleaseId: release.id, idempotencyKey: 'parallel-a' },
        'user-1',
      ),
      store.createDeployment(
        application.id,
        { targetReleaseId: release.id, idempotencyKey: 'parallel-b' },
        'user-1',
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { code: 'DEPLOYMENT_IN_PROGRESS', status: 409 },
    });
  });

  it('serves protected application, release, and asynchronous deployment routes', async () => {
    const { database, store } = await createStore();
    const releaseRoot = await mkdtemp(
      path.join(tmpdir(), 'nocobase-hub-routes-release-'),
    );
    temporaryDirectories.push(releaseRoot);
    const publicAuth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-domain-routes-secret-at-least-32-characters',
    });
    const bootstrapAuth = new Auth({
      connection: database.connection,
      baseURL: 'http://localhost/hub/api/auth',
      secret: 'hub-domain-routes-secret-at-least-32-characters',
    });
    const api = createHubApi({
      database,
      auth: publicAuth,
      bootstrapAuth,
      releaseRoot,
      appName: 'hub',
      publicBasePath: '/hub',
    });
    const mounted = new Hono();
    mounted.route('/hub/api', api);
    const owner = await mounted.request(
      'http://localhost/hub/api/setup/owner',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          email: 'routes-owner@example.com',
          password: 'correct horse battery staple',
          name: 'Routes Owner',
          username: 'routesowner',
        }),
      },
    );
    expect(owner.status).toBe(201);
    const signIn = await mounted.request(
      'http://localhost/hub/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          email: 'routes-owner@example.com',
          password: 'correct horse battery staple',
        }),
      },
    );
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.get('set-cookie') ?? '';
    const appResponse = await mounted.request('http://localhost/hub/api/apps', {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ slug: 'routes-app', name: 'Routes App' }),
    });
    expect(appResponse.status).toBe(201);
    const application = (
      (await appResponse.json()) as {
        data: { id: string; createdBy: string };
      }
    ).data;
    const storageKey = `${application.id}/release-1.0.0`;
    const releaseDirectory = path.join(releaseRoot, storageKey);
    await mkdir(releaseDirectory, { recursive: true });
    await writeFile(path.join(releaseDirectory, 'artifact.txt'), 'artifact');
    const { release } = await store.createRelease(
      application.id,
      {
        version: '1.0.0',
        checksum: await computeReleaseArtifactChecksum(releaseDirectory),
        manifest: {},
        storageKey,
      },
      application.createdBy,
    );
    const deploymentResponse = await mounted.request(
      `http://localhost/hub/api/apps/${application.id}/deployments`,
      {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          'idempotency-key': 'routes-deploy-1',
          origin: 'http://localhost',
        },
        body: JSON.stringify({ targetReleaseId: release.id }),
      },
    );
    expect(deploymentResponse.status).toBe(202);
    const deployment = (
      (await deploymentResponse.json()) as { data: { id: string } }
    ).data;
    await expect
      .poll(async () => {
        const response = await mounted.request(
          `http://localhost/hub/api/deployments/${deployment.id}`,
          {
            headers: { cookie },
          },
        );
        return ((await response.json()) as { data: { status: string } }).data
          .status;
      })
      .toBe('failed');
    const applicationAfterFailure = await mounted.request(
      `http://localhost/hub/api/apps/${application.id}`,
      { headers: { cookie } },
    );
    await expect(applicationAfterFailure.json()).resolves.toMatchObject({
      data: { activeRelease: null },
    });
    await api.close();
  });
});
