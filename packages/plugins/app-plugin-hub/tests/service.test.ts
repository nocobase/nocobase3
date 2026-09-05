import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {
  HostDeploymentSet,
  HostManagementService,
  HostStatus,
} from '@nocobase/app-host/management';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import { c as createTar } from 'tar';
import { parse as parseYaml } from 'yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import migration from '../database/migrations/202609010001_create_hub_app_tables.js';
import {
  DefaultHubService,
  HubError,
  type HubHostController,
} from '../server/services/hub.js';

describe('@nocobase/app-plugin-hub service', () => {
  let database: DatabaseManager;
  let rootDir: string;
  let host: FakeHostController;
  let service: DefaultHubService;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), 'nocobase-hub-test-'));
    database = createDatabaseManager({
      default: 'main',
      metadataStore: new InMemoryCollectionMetadataStore(),
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const connection = database.connection();
    await migration.up({
      builder: connection.builder,
      query: connection.query,
      connection,
    });
    host = new FakeHostController();
    service = new DefaultHubService({
      database,
      hostController: host,
      config: {
        artifact: {
          driver: 'fs',
          location: path.join(rootDir, 'app-artifacts'),
          visibility: 'private',
        },
        host: {
          enabled: true,
          driver: 'tsx',
          appDeploymentsDir: path.join(rootDir, 'app-deployments'),
          appVolumesDir: path.join(rootDir, 'app-volumes'),
          configPath: path.join(rootDir, 'hub', 'host-config.yml'),
        },
      },
    });
    await service.prepare();
  });

  afterEach(async () => {
    await service.shutdown();
    await database.destroy();
    await rm(rootDir, { recursive: true, force: true });
  });

  it('creates an App without inventing a deployment record', async () => {
    const detail = await service.createApp({
      id: 'customer',
      name: 'Customer',
    });

    expect(detail).toMatchObject({
      app: { id: 'customer', name: 'Customer' },
      deployment: {
        desiredState: 'stopped',
        activation: 'eager',
        config: { mode: 'file' },
      },
      hasReleases: false,
      hasPendingDeployment: false,
      currentVersion: null,
    });
  });

  it('restarts only the requested App without creating a deployment', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    await expect(service.restart('customer')).rejects.toMatchObject({
      code: 'APP_NOT_DEPLOYED',
    });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });
    const queued = await service.deploy('customer', {
      releaseId: release.id,
      config: { mode: 'external' },
    });
    await waitForDeployment(service, 'customer', queued.id);
    const before = await service.getApp('customer');
    host.targetedOperations = [];
    const after = await service.restart('customer');
    expect(host.targetedOperations).toEqual([
      'stop:customer',
      'start:customer',
    ]);
    expect(after.app.currentDeploymentId).toBe(before.app.currentDeploymentId);
    expect(after.deployment.activation).toBe(before.deployment.activation);
    expect(after.runtime.state).toBe('running');
    expect(await service.listDeployments('customer')).toHaveLength(1);
    await service.stop('customer');
    await expect(service.restart('customer')).rejects.toMatchObject({
      code: 'APP_NOT_RUNNING',
    });
  });

  it('lists lightweight summaries with one shared Host status request', async () => {
    await service.createApp({ id: 'first', name: 'First' });
    await service.createApp({ id: 'second', name: 'Second' });
    const status = vi.spyOn(service, 'hostStatus');
    const releases = vi.spyOn(service, 'listReleases');
    const deployments = vi.spyOn(service, 'listDeployments');
    const apps = await service.listApps();
    expect(apps).toHaveLength(2);
    expect(status).toHaveBeenCalledTimes(1);
    expect(releases).not.toHaveBeenCalled();
    expect(deployments).not.toHaveBeenCalled();
    for (const app of apps) {
      expect(app).toMatchObject({
        currentVersion: null,
        hasReleases: false,
        hasPendingDeployment: false,
      });
      expect(app).not.toHaveProperty('releases');
      expect(app).not.toHaveProperty('deployments');
      expect(app).not.toHaveProperty('deployment');
    }
    status.mockRejectedValue(new Error('Host offline'));
    const offline = await service.listApps();
    expect(status).toHaveBeenCalledTimes(2);
    expect(offline.every((app) => app.runtime.state === 'unknown')).toBe(true);
    vi.restoreAllMocks();
  });

  it('does not contact Host for an empty catalog', async () => {
    const status = vi.spyOn(service, 'hostStatus');
    expect(await service.listApps()).toEqual([]);
    expect(status).not.toHaveBeenCalled();
    status.mockRestore();
  });

  it('stores a Release config example as the deployment template', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3', {
        configTemplate: '# Customer settings\nfeature:\n  enabled: false\n',
      }),
    });
    const content = '# Edited by the Hub\nfeature:\n  enabled: true\n';

    const queued = await service.deploy('customer', {
      releaseId: release.id,
      config: { mode: 'file', content },
    });
    const deployment = await waitForDeployment(service, 'customer', queued.id);
    const detail = await service.getApp('customer');

    expect(release.configTemplate).toBe(
      '# Customer settings\nfeature:\n  enabled: false\n',
    );
    expect(release.version).toBe('1.2.3');
    expect(deployment).toMatchObject({
      status: 'succeeded',
      phase: 'completed',
      cacheHit: false,
    });
    expect(detail.app.currentDeploymentId).toBe(queued.id);
    expect(detail.currentVersion).toBe('1.2.3');
    expect(detail).not.toHaveProperty('releases');
    expect(detail).not.toHaveProperty('deployments');
    expect(
      (await service.listDeployments('customer'))[0]?.release,
    ).toMatchObject({ version: '1.2.3', checksum: release.checksum });
    expect(host.lastDeploymentSet?.deployments).toEqual([
      expect.objectContaining({
        appId: 'customer',
        desiredState: 'running',
        config: expect.objectContaining({ provider: 'file' }),
      }),
    ]);
    const configPath = deployment.config.path;
    if (!configPath) throw new Error('Expected deployment config path.');
    expect(parseYaml(await readFile(configPath, 'utf8'))).toEqual({
      feature: { enabled: true },
    });
    expect(await readFile(configPath, 'utf8')).toBe(content);
  });

  it('persists application startup settings and starts a stopped app', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    await service.updateSettings('customer', { activation: 'lazy' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });
    await service.deploy('customer', { releaseId: release.id });
    await waitForLatestDeployment(service, 'customer');

    expect(host.lastDeploymentSet?.deployments[0]).toMatchObject({
      desiredState: 'running',
      activation: 'lazy',
    });
    await service.stop('customer');

    const detail = await service.start('customer');

    expect(detail.deployment).toMatchObject({
      desiredState: 'running',
      observedState: 'running',
      activation: 'lazy',
    });
    expect(host.lastDeploymentSet?.deployments[0]).toMatchObject({
      desiredState: 'running',
      activation: 'lazy',
    });
    expect(host.targetedOperations).toEqual([
      'deploy:customer',
      'stop:customer',
      'start:customer',
    ]);
  });

  it('removes only the selected application and its persisted resources', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });
    await service.deploy('customer', { releaseId: release.id });

    await service.remove('customer');

    await expect(service.getApp('customer')).rejects.toMatchObject<
      Partial<HubError>
    >({ code: 'APP_NOT_FOUND' });
    expect(host.targetedOperations.at(-1)).toBe('remove:customer');
  });

  it('records an asynchronous failure without replacing the active deployment', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });
    host.nextApplyError = new Error('activation failed');

    const queued = await service.deploy('customer', { releaseId: release.id });
    const failed = await waitForDeployment(service, 'customer', queued.id);
    expect(failed).toMatchObject({
      status: 'failed',
      error: 'activation failed',
    });
    await expect(service.getApp('customer')).resolves.toMatchObject({
      app: { currentDeploymentId: null },
    });
  });

  it('returns valid database dates rather than the Unix epoch', async () => {
    const before = Date.now() - 1_000;
    const detail = await service.createApp({
      id: 'customer',
      name: 'Customer',
    });

    expect(detail.app.createdAt.valueOf()).toBeGreaterThan(before);
    expect(detail.app.updatedAt.valueOf()).toBeGreaterThan(before);
  });

  it('accepts a Release without a config example', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });

    expect(release.configTemplate).toBeNull();
  });

  it.each(['config.example.yml', 'config.example.yaml'])(
    'reads %s as the Release config template',
    async (configTemplateName) => {
      await service.createApp({ id: 'customer', name: 'Customer' });
      const release = await service.createRelease('customer', {
        bytes: await createArtifact(rootDir, '1.2.3', {
          configTemplate: '{"feature":{"enabled":true}}\n',
          configTemplateName,
        }),
      });

      expect(release.configTemplate).toBe('{"feature":{"enabled":true}}\n');
    },
  );

  it('does not treat a real config.yml in the Release as a template', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3', {
        configTemplate: 'auth:\n  secret: must-not-be-imported\n',
        configTemplateName: 'config.yml',
      }),
    });

    expect(release.configTemplate).toBeNull();
  });

  it('does not treat config.example.json as a supported template', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3', {
        configTemplate: '{"feature":true}\n',
        configTemplateName: 'config.example.json',
      }),
    });

    expect(release.configTemplate).toBeNull();
  });

  it('rejects a Release with multiple config examples', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });

    await expect(
      service.createRelease('customer', {
        bytes: await createArtifact(rootDir, '1.2.3', {
          configTemplates: {
            'config.example.yml': 'feature: yml\n',
            'config.example.yaml': 'feature: yaml\n',
          },
        }),
      }),
    ).rejects.toMatchObject<Partial<HubError>>({
      code: 'INVALID_ARTIFACT',
      status: 422,
    });
  });

  it('rejects an invalid version in the Artifact package manifest', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });

    await expect(
      service.createRelease('customer', {
        bytes: await createArtifact(rootDir, 'invalid version'),
      }),
    ).rejects.toMatchObject<Partial<HubError>>({
      code: 'INVALID_ARTIFACT_VERSION',
      status: 422,
    });
  });

  it('initializes an absent config file from the Release template', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3', {
        configTemplate: 'feature:\n  enabled: true\n',
      }),
    });

    const queued = await service.deploy('customer', { releaseId: release.id });
    const deployment = await waitForDeployment(service, 'customer', queued.id);

    await expect(readFile(deployment.config.path!, 'utf8')).resolves.toBe(
      'feature:\n  enabled: true\n',
    );
    await expect(stat(deployment.config.path!)).resolves.toMatchObject({
      mode: expect.any(Number),
    });
    expect((await stat(deployment.config.path!)).mode & 0o777).toBe(0o600);
    expect(
      (await stat(path.dirname(deployment.config.path!))).mode & 0o777,
    ).toBe(0o700);
    expect(host.lastDeploymentSet?.deployments[0]?.config).toEqual({
      provider: 'file',
      path: deployment.config.path,
    });
  });

  it('does not overwrite saved config with a newer Release template', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3', {
        configTemplate: 'feature:\n  enabled: true\n',
      }),
    });

    const queued = await service.deploy('customer', {
      releaseId: release.id,
      config: { mode: 'file', content: 'feature:\n  enabled: false\n' },
    });
    const deployment = await waitForDeployment(service, 'customer', queued.id);

    await expect(readFile(deployment.config.path!, 'utf8')).resolves.toBe(
      'feature:\n  enabled: false\n',
    );
  });

  it('does not pass config to Host in external mode', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });

    const queued = await service.deploy('customer', {
      releaseId: release.id,
      config: { mode: 'external' },
    });
    await waitForDeployment(service, 'customer', queued.id);

    expect(await service.readConfig('customer')).toEqual({
      mode: 'external',
      content: null,
    });
    expect(host.lastDeploymentSet?.deployments[0]?.config).toBeUndefined();
  });

  it('updates the active file configuration without creating a deployment', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });
    const queued = await service.deploy('customer', {
      releaseId: release.id,
      config: { mode: 'file', content: 'feature: false\n' },
    });
    const deployment = await waitForDeployment(service, 'customer', queued.id);
    const deploymentsBefore = await service.listDeployments('customer');

    await expect(
      service.updateConfig('customer', { content: 'feature: true\n' }),
    ).resolves.toEqual({ mode: 'file', content: 'feature: true\n' });

    await expect(readFile(deployment.config.path!, 'utf8')).resolves.toBe(
      'feature: true\n',
    );
    await expect(service.listDeployments('customer')).resolves.toHaveLength(
      deploymentsBefore.length,
    );
    expect(host.targetedOperations).toEqual(['deploy:customer']);
  });

  it('rejects invalid updates to the active file configuration', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });
    const queued = await service.deploy('customer', {
      releaseId: release.id,
      config: { mode: 'file', content: 'feature: false\n' },
    });
    await waitForDeployment(service, 'customer', queued.id);

    await expect(
      service.updateConfig('customer', { content: 'feature: [' }),
    ).rejects.toMatchObject<Partial<HubError>>({
      code: 'INVALID_CONFIG_FILE',
      status: 422,
    });
  });

  it('does not allow Hub to edit external configuration', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });
    const queued = await service.deploy('customer', {
      releaseId: release.id,
      config: { mode: 'external' },
    });
    await waitForDeployment(service, 'customer', queued.id);

    await expect(
      service.updateConfig('customer', { content: 'feature: true\n' }),
    ).rejects.toMatchObject<Partial<HubError>>({
      code: 'CONFIG_NOT_EDITABLE',
      status: 409,
    });
  });

  it('refreshes observed state from the managed Host', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });
    await service.deploy('customer', { releaseId: release.id });
    await waitForLatestDeployment(service, 'customer');
    const current = host.lastDeploymentSet?.deployments[0];
    if (!current) throw new Error('Expected a deployment spec.');
    host.lastDeploymentSet = {
      revision: 42,
      deployments: [{ ...current, desiredState: 'stopped' }],
    };

    const detail = await service.refresh('customer');

    expect(detail.runtime).toMatchObject({
      state: 'stopped',
      hostRevision: 42,
    });
  });

  it('rejects invalid YAML and non-object file configuration', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });

    await expect(
      service.deploy('customer', {
        releaseId: release.id,
        config: { mode: 'file', content: 'feature: [' },
      }),
    ).rejects.toMatchObject<Partial<HubError>>({
      code: 'INVALID_CONFIG_FILE',
      status: 422,
    });
    await expect(
      service.deploy('customer', {
        releaseId: release.id,
        config: { mode: 'file', content: '- one\n- two\n' },
      }),
    ).rejects.toMatchObject<Partial<HubError>>({
      code: 'INVALID_CONFIG_FILE',
      status: 422,
    });
  });

  it('allows multiple builds with the same version', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const first = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });
    const second = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3', {
        configTemplate: 'feature: true\n',
      }),
    });

    expect(second.version).toBe(first.version);
    expect(second.id).not.toBe(first.id);
    expect(second.checksum).not.toBe(first.checksum);
  });

  it('uses the selected Release config example for a new deployment', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const firstRelease = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.0.0', {
        configTemplate: 'feature: old\n',
      }),
    });
    const first = await service.deploy('customer', {
      releaseId: firstRelease.id,
    });
    await waitForDeployment(service, 'customer', first.id);

    const secondRelease = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '2.0.0', {
        configTemplate: 'feature: new\n',
      }),
    });
    const second = await service.deploy('customer', {
      releaseId: secondRelease.id,
    });
    const completed = await waitForDeployment(service, 'customer', second.id);

    await expect(readFile(completed.config.path!, 'utf8')).resolves.toBe(
      'feature: new\n',
    );
  });

  it('keeps the active configuration when a Release has no config example', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const firstRelease = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.0.0', {
        configTemplate: 'feature: current\n',
      }),
    });
    const first = await service.deploy('customer', {
      releaseId: firstRelease.id,
    });
    await waitForDeployment(service, 'customer', first.id);

    const secondRelease = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '2.0.0'),
    });
    const second = await service.deploy('customer', {
      releaseId: secondRelease.id,
    });
    const completed = await waitForDeployment(service, 'customer', second.id);

    await expect(readFile(completed.config.path!, 'utf8')).resolves.toBe(
      'feature: current\n',
    );
  });

  it('rolls back by creating a new deployment history record', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const firstRelease = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.0.0'),
    });
    const first = await service.deploy('customer', {
      releaseId: firstRelease.id,
    });
    await waitForDeployment(service, 'customer', first.id);
    const secondRelease = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '2.0.0'),
    });
    const second = await service.deploy('customer', {
      releaseId: secondRelease.id,
    });
    await waitForDeployment(service, 'customer', second.id);

    const rollback = await service.rollback('customer', {
      deploymentId: first.id,
    });
    const completed = await waitForDeployment(service, 'customer', rollback.id);

    expect(completed).toMatchObject({
      kind: 'rollback',
      releaseId: firstRelease.id,
      rollbackTargetDeploymentId: first.id,
      previousDeploymentId: second.id,
      status: 'succeeded',
    });
    await expect(service.getApp('customer')).resolves.toMatchObject({
      app: { currentDeploymentId: rollback.id },
    });
  });

  it('allows rollback configuration to be reviewed and changed', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.0.0'),
    });
    const first = await service.deploy('customer', {
      releaseId: release.id,
      config: { mode: 'file', content: 'feature: false\n' },
    });
    await waitForDeployment(service, 'customer', first.id);

    await expect(service.readConfig('customer')).resolves.toMatchObject({
      mode: 'file',
      content: 'feature: false\n',
    });

    const rollback = await service.rollback('customer', {
      deploymentId: first.id,
      config: { mode: 'file', content: 'feature: true\n' },
    });
    const completed = await waitForDeployment(service, 'customer', rollback.id);

    expect(completed.config).toEqual(first.config);
    await expect(readFile(completed.config.path!, 'utf8')).resolves.toBe(
      'feature: true\n',
    );
  });

  it('inherits the target deployment config mode during rollback', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.0.0'),
    });
    const target = await service.deploy('customer', {
      releaseId: release.id,
      config: { mode: 'external' },
    });
    await waitForDeployment(service, 'customer', target.id);

    const rollback = await service.rollback('customer', {
      deploymentId: target.id,
    });
    const completed = await waitForDeployment(service, 'customer', rollback.id);

    expect(completed.config).toEqual({ mode: 'external' });
    expect(host.lastDeploymentSet?.deployments[0]?.config).toBeUndefined();
  });

  it('rejects changing the target deployment config mode during rollback', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.0.0'),
    });
    const target = await service.deploy('customer', {
      releaseId: release.id,
      config: { mode: 'external' },
    });
    await waitForDeployment(service, 'customer', target.id);

    await expect(
      service.rollback('customer', {
        deploymentId: target.id,
        config: { mode: 'file', content: 'feature: true\n' },
      }),
    ).rejects.toMatchObject<Partial<HubError>>({
      code: 'ROLLBACK_CONFIG_MODE_MISMATCH',
      status: 409,
    });
  });

  it('does not wait for eager Apps to finish during Host startup', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });
    const deployed = await service.deploy('customer', {
      releaseId: release.id,
    });
    await waitForDeployment(service, 'customer', deployed.id);
    let releaseStartup: (() => void) | undefined;
    host.nextDeploymentSetGate = new Promise<void>((resolve) => {
      releaseStartup = resolve;
    });

    await expect(service.restoreDesiredState()).resolves.toBeUndefined();
    expect(host.deploymentSetStarted).toBe(true);
    expect(host.deploymentSetCompleted).toBe(false);

    releaseStartup?.();
    await host.nextDeploymentSetGate;
  });
});

async function waitForLatestDeployment(
  service: DefaultHubService,
  appId: string,
): Promise<import('../server/tokens.js').HubDeploymentRecord> {
  const [deployment] = await service.listDeployments(appId);
  if (!deployment) throw new Error('Expected a deployment.');
  return await waitForDeployment(service, appId, deployment.id);
}

async function waitForDeployment(
  service: DefaultHubService,
  appId: string,
  deploymentId: string,
): Promise<import('../server/tokens.js').HubDeploymentRecord> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const deployment = await service.getDeployment(appId, deploymentId);
    if (deployment.status !== 'queued' && deployment.status !== 'deploying') {
      return deployment;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Deployment did not complete.');
}

class FakeHostController implements HubHostController {
  public lastDeploymentSet: HostDeploymentSet | undefined;
  public targetedOperations: string[] = [];
  public nextApplyError: Error | undefined;
  public nextDeploymentSetGate: Promise<void> | undefined;
  public deploymentSetStarted = false;
  public deploymentSetCompleted = false;

  public async ensureStarted(): Promise<URL> {
    return new URL('http://127.0.0.1:13010');
  }

  public async applyDeploymentSet(
    deploymentSet: HostDeploymentSet,
  ): Promise<{ readonly status: HostStatus }> {
    this.deploymentSetStarted = true;
    await this.nextDeploymentSetGate;
    this.lastDeploymentSet = deploymentSet;
    this.deploymentSetCompleted = true;
    return { status: createStatus(deploymentSet) };
  }

  public async applyDeployment(
    deployment: HostDeploymentSet['deployments'][number],
  ): Promise<HostStatus> {
    this.targetedOperations.push(`deploy:${deployment.appId}`);
    if (this.nextApplyError) {
      const error = this.nextApplyError;
      this.nextApplyError = undefined;
      throw error;
    }
    return this.updateDeployment(deployment);
  }

  public async startDeployment(
    deployment: HostDeploymentSet['deployments'][number],
  ): Promise<HostStatus> {
    this.targetedOperations.push(`start:${deployment.appId}`);
    return this.updateDeployment({ ...deployment, desiredState: 'running' });
  }

  public async stopDeployment(appId: string): Promise<HostStatus> {
    this.targetedOperations.push(`stop:${appId}`);
    const deployment = this.lastDeploymentSet?.deployments.find(
      (candidate) => candidate.appId === appId,
    );
    if (!deployment) throw new Error('Expected a deployment spec.');
    return this.updateDeployment({ ...deployment, desiredState: 'stopped' });
  }

  public async removeDeployment(appId: string): Promise<HostStatus> {
    this.targetedOperations.push(`remove:${appId}`);
    const revision = (this.lastDeploymentSet?.revision ?? 0) + 1;
    this.lastDeploymentSet = {
      revision,
      deployments:
        this.lastDeploymentSet?.deployments.filter(
          (deployment) => deployment.appId !== appId,
        ) ?? [],
    };
    return createStatus(this.lastDeploymentSet);
  }

  public async getManagementClient(): Promise<HostManagementService> {
    return {
      applyDeploymentSet: async (deploymentSet) => ({
        accepted: true,
        status: createStatus(deploymentSet),
      }),
      applyDeployment: (deployment) => this.applyDeployment(deployment),
      startDeployment: (deployment) => this.startDeployment(deployment),
      stopDeployment: (appId) => this.stopDeployment(appId),
      removeDeployment: (appId) => this.removeDeployment(appId),
      getStatus: async () =>
        createStatus(
          this.lastDeploymentSet ?? { revision: 0, deployments: [] },
        ),
      restartApp: async () =>
        createStatus(
          this.lastDeploymentSet ?? { revision: 0, deployments: [] },
        ),
    };
  }

  public async shutdown(): Promise<void> {}

  private updateDeployment(
    deployment: HostDeploymentSet['deployments'][number],
  ): HostStatus {
    const revision = (this.lastDeploymentSet?.revision ?? 0) + 1;
    this.lastDeploymentSet = {
      revision,
      deployments: [
        ...(this.lastDeploymentSet?.deployments.filter(
          (candidate) => candidate.id !== deployment.id,
        ) ?? []),
        deployment,
      ],
    };
    return createStatus(this.lastDeploymentSet);
  }
}

function createStatus(deploymentSet: HostDeploymentSet): HostStatus {
  return {
    mode: 'managed',
    ready: true,
    desiredRevision: deploymentSet.revision,
    reconciledRevision: deploymentSet.revision,
    deployments: deploymentSet.deployments.map((deployment) => ({
      id: deployment.id,
      appId: deployment.appId,
      desiredState: deployment.desiredState,
      observedState:
        deployment.desiredState === 'running' ? 'running' : 'stopped',
      revision: deploymentSet.revision,
      cacheHit: false,
      app: null,
      error: null,
    })),
  };
}

async function createArtifact(
  rootDir: string,
  version: string,
  options: {
    readonly configTemplate?: string;
    readonly configTemplateName?: string;
    readonly configTemplates?: Readonly<Record<string, string>>;
  } = {},
): Promise<Uint8Array> {
  const source = path.join(rootDir, `artifact-${version}`);
  const archive = path.join(rootDir, `artifact-${version}.tar.gz`);
  await mkdir(path.join(source, 'dist', 'server'), { recursive: true });
  await writeFile(
    path.join(source, 'package.json'),
    JSON.stringify({ name: '@example/customer', version }),
  );
  await writeFile(path.join(source, 'dist', 'server', 'embedded.js'), '');
  const entries = ['package.json', 'dist/server/embedded.js'];
  if (options.configTemplate !== undefined) {
    const configTemplateName =
      options.configTemplateName ?? 'config.example.yml';
    await writeFile(
      path.join(source, configTemplateName),
      options.configTemplate,
    );
    entries.push(configTemplateName);
  }
  for (const [configTemplateName, configTemplate] of Object.entries(
    options.configTemplates ?? {},
  )) {
    await writeFile(path.join(source, configTemplateName), configTemplate);
    entries.push(configTemplateName);
  }
  await createTar({ cwd: source, file: archive, gzip: true }, entries);
  return await readFile(archive);
}
