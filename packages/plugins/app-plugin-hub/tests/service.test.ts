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
        config: { provider: 'file' },
      },
      releases: [],
    });
  });

  it('stores Release schema, saves file config, and deploys desired state', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      version: '1.2.3',
      bytes: await createArtifact(rootDir, '1.2.3'),
    });
    const content = {
      feature: { enabled: true },
      customProvider: { endpoint: 'https://example.test' },
    };

    await service.saveConfig('customer', {
      releaseId: release.id,
      content,
    });
    const detail = await service.deploy('customer', {
      releaseId: release.id,
    });

    expect(release.configSchema).toMatchObject({
      formatVersion: 1,
      configs: [expect.objectContaining({ namespace: 'feature' })],
    });
    expect(detail.deployment).toMatchObject({
      desiredReleaseId: release.id,
      observedReleaseId: release.id,
      desiredState: 'running',
      observedState: 'running',
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
    expect(parseYaml(await readFile(configPath, 'utf8'))).toEqual(content);
  });

  it('rejects config that violates the selected Release schema', async () => {
    await service.createApp({ id: 'customer', name: 'Customer' });
    const release = await service.createRelease('customer', {
      version: '1.2.3',
      bytes: await createArtifact(rootDir, '1.2.3'),
    });

    await expect(
      service.saveConfig('customer', {
        releaseId: release.id,
        content: { feature: { enabled: 'yes' } },
      }),
    ).rejects.toMatchObject<Partial<HubError>>({
      code: 'INVALID_CONFIG',
      status: 422,
    });
  });
});

class FakeHostController implements HubHostController {
  public lastDeploymentSet: HostDeploymentSet | undefined;

  public async ensureStarted(): Promise<URL> {
    return new URL('http://127.0.0.1:13010');
  }

  public async applyDeploymentSet(
    deploymentSet: HostDeploymentSet,
  ): Promise<{ readonly status: HostStatus }> {
    this.lastDeploymentSet = deploymentSet;
    return { status: createStatus(deploymentSet) };
  }

  public async getManagementClient(): Promise<HostManagementService> {
    return {
      applyDeploymentSet: async (deploymentSet) => ({
        accepted: true,
        status: createStatus(deploymentSet),
      }),
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
): Promise<Uint8Array> {
  const source = path.join(rootDir, `artifact-${version}`);
  const archive = path.join(rootDir, `artifact-${version}.tar.gz`);
  await mkdir(path.join(source, 'dist'), { recursive: true });
  await writeFile(
    path.join(source, 'package.json'),
    JSON.stringify({ name: '@example/customer', version }),
  );
  await writeFile(
    path.join(source, 'dist', 'config-schema.json'),
    JSON.stringify({
      formatVersion: 1,
      configs: [
        {
          namespace: 'feature',
          schema: {
            type: 'object',
            properties: { enabled: { type: 'boolean' } },
            required: ['enabled'],
            additionalProperties: false,
          },
        },
      ],
      variants: [],
    }),
  );
  await createTar({ cwd: source, file: archive, gzip: true }, [
    'package.json',
    'dist/config-schema.json',
  ]);
  return await readFile(archive);
}
