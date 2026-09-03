import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
          deploymentsDir: path.join(rootDir, 'app-deployments'),
          volumesDir: path.join(rootDir, 'app-volumes'),
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

  it('creates an App with a stopped desired deployment', async () => {
    const detail = await service.createApp({
      id: 'customer',
      name: 'Customer',
    });

    expect(detail).toMatchObject({
      app: { id: 'customer', name: 'Customer' },
      deployment: {
        appId: 'customer',
        desiredState: 'stopped',
        activation: 'eager',
        config: { mode: 'file' },
      },
      releases: [],
    });
  });

  it('stores a Release config template and deploys Hub-managed file config', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3', {
        configTemplate: '# Customer settings\nfeature:\n  enabled: false\n',
      }),
    });
    const content = '# Edited by the Hub\nfeature:\n  enabled: true\n';

    await service.saveConfig('customer', {
      mode: 'file',
      content,
    });
    const detail = await service.deploy('customer', {
      releaseId: release.id,
    });

    expect(release.configTemplate).toBe(
      '# Customer settings\nfeature:\n  enabled: false\n',
    );
    expect(release.version).toBe('1.2.3');
    expect(detail.deployment).toMatchObject({
      desiredReleaseId: release.id,
      observedReleaseId: release.id,
      desiredState: 'running',
      observedState: 'running',
      activation: 'eager',
    });
    expect(host.lastDeploymentSet?.deployments).toEqual([
      expect.objectContaining({
        appId: 'customer',
        desiredState: 'running',
        config: { provider: 'file' },
      }),
    ]);
    const configPath = path.join(
      rootDir,
      'app-volumes',
      'customer',
      'config.yml',
    );
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

  it('reports a deployment failure instead of returning a successful detail', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });
    host.nextApplyError = new Error('activation failed');

    await expect(
      service.deploy('customer', { releaseId: release.id }),
    ).rejects.toMatchObject<Partial<HubError>>({
      code: 'DEPLOYMENT_FAILED',
      status: 503,
    });
    await expect(service.getApp('customer')).resolves.toMatchObject({
      deployment: {
        desiredReleaseId: null,
        desiredState: 'stopped',
        observedState: 'stopped',
        error: 'activation failed',
      },
    });
  });

  it('returns valid database dates rather than the Unix epoch', async () => {
    const before = Date.now() - 1_000;
    const detail = await service.createApp({
      id: 'customer',
      name: 'Customer',
    });

    expect(detail.app.createdAt.valueOf()).toBeGreaterThan(before);
    expect(detail.deployment.updatedAt.valueOf()).toBeGreaterThan(before);
  });

  it('accepts a Release without a config template', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });

    expect(release.configTemplate).toBeNull();
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

    await service.deploy('customer', { releaseId: release.id });

    await expect(
      readFile(
        path.join(rootDir, 'app-volumes', 'customer', 'config.yml'),
        'utf8',
      ),
    ).resolves.toBe('feature:\n  enabled: true\n');
    expect(host.lastDeploymentSet?.deployments[0]?.config).toEqual({
      provider: 'file',
      path: undefined,
    });
  });

  it('does not overwrite saved config with a newer Release template', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    await service.saveConfig('customer', {
      mode: 'file',
      content: 'feature:\n  enabled: false\n',
    });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3', {
        configTemplate: 'feature:\n  enabled: true\n',
      }),
    });

    await service.deploy('customer', { releaseId: release.id });

    await expect(
      readFile(
        path.join(rootDir, 'app-volumes', 'customer', 'config.yml'),
        'utf8',
      ),
    ).resolves.toBe('feature:\n  enabled: false\n');
  });

  it('does not pass config to Host in external mode', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });

    await service.saveConfig('customer', {
      mode: 'file',
      content: 'feature:\n  enabled: true\n',
    });
    await service.saveConfig('customer', { mode: 'external' });
    await service.deploy('customer', { releaseId: release.id });

    expect(await service.readConfig('customer')).toEqual({
      mode: 'external',
      content: null,
      path: null,
    });
    expect(host.lastDeploymentSet?.deployments[0]?.config).toBeUndefined();
    await expect(
      readFile(
        path.join(rootDir, 'app-volumes', 'customer', 'config.yml'),
        'utf8',
      ),
    ).resolves.toBe('feature:\n  enabled: true\n');
  });

  it('refreshes observed state from the managed Host', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      bytes: await createArtifact(rootDir, '1.2.3'),
    });
    await service.deploy('customer', { releaseId: release.id });
    const current = host.lastDeploymentSet?.deployments[0];
    if (!current) throw new Error('Expected a deployment spec.');
    host.lastDeploymentSet = {
      revision: 42,
      deployments: [{ ...current, desiredState: 'stopped' }],
    };

    const detail = await service.refresh('customer');

    expect(detail.deployment).toMatchObject({
      observedState: 'stopped',
      observedRevision: 42,
    });
  });

  it('rejects invalid YAML and non-object file configuration', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });

    await expect(
      service.saveConfig('customer', {
        mode: 'file',
        content: 'feature: [',
      }),
    ).rejects.toMatchObject<Partial<HubError>>({
      code: 'INVALID_CONFIG_FILE',
      status: 422,
    });
    await expect(
      service.saveConfig('customer', {
        mode: 'file',
        content: '- one\n- two\n',
      }),
    ).rejects.toMatchObject<Partial<HubError>>({
      code: 'INVALID_CONFIG_FILE',
      status: 422,
    });
  });
});

class FakeHostController implements HubHostController {
  public lastDeploymentSet: HostDeploymentSet | undefined;
  public targetedOperations: string[] = [];
  public nextApplyError: Error | undefined;

  public async ensureStarted(): Promise<URL> {
    return new URL('http://127.0.0.1:13010');
  }

  public async applyDeploymentSet(
    deploymentSet: HostDeploymentSet,
  ): Promise<{ readonly status: HostStatus }> {
    this.lastDeploymentSet = deploymentSet;
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
      app: null,
      error: null,
    })),
  };
}

async function createArtifact(
  rootDir: string,
  version: string,
  options: { readonly configTemplate?: string } = {},
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
    await writeFile(path.join(source, 'config.yml'), options.configTemplate);
    entries.push('config.yml');
  }
  await createTar({ cwd: source, file: archive, gzip: true }, entries);
  return await readFile(archive);
}
