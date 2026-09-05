/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { c as createTar } from 'tar';
import {
  createAppHost,
  type AppHost,
  type HostDeploymentSet,
  type ArtifactReference,
} from '../dist/index.js';

const tempDirs: string[] = [];
const hosts: AppHost[] = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.close('test cleanup')));
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe('managed host reconciliation', () => {
  it('restores local revisions without reading artifacts and fails when the revision is missing', async () => {
    const fixture = await createFixture();
    const options = {
      mode: 'managed' as const,
      appDeploymentsDir: fixture.deploymentsDir,
      appVolumesDir: fixture.volumesDir,
      artifact: fsArtifact(fixture.artifactDir),
      evictionIntervalMs: 0,
    };
    const initial = createAppHost(options);
    const set = deploymentSet(1, fixture.artifact, { activation: 'eager' });
    await initial.management.applyDeploymentSet(set);
    await initial.close();
    await rm(path.join(fixture.artifactDir, fixture.artifact.key));
    const restored = createAppHost(options);
    hosts.push(restored);
    expect(
      (await restored.management.restoreDeploymentSet(set)).status
        .deployments[0]?.observedState,
    ).toBe('running');
    await restored.close();
    hosts.pop();
    await rm(revisionDirectory(fixture.deploymentsDir, fixture.artifact), {
      recursive: true,
    });
    const missing = createAppHost(options);
    hosts.push(missing);
    const result = await missing.management.restoreDeploymentSet(set);
    expect(result.status.deployments[0]).toMatchObject({
      observedState: 'failed',
      error: expect.stringContaining('Deploy the release again'),
    });
  });

  it('reports pending while startup is in progress and other Apps are queued', async () => {
    const { deploymentsDir, volumesDir, artifact, artifactDir } =
      await createFixture();
    const host = createAppHost({
      mode: 'managed',
      appDeploymentsDir: deploymentsDir,
      appVolumesDir: volumesDir,
      artifact: fsArtifact(artifactDir),
      evictionIntervalMs: 0,
    });
    hosts.push(host);
    const gate = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const replace = host.registry.replaceDefinition.bind(host.registry);
    vi.spyOn(host.registry, 'replaceDefinition').mockImplementationOnce(
      async (...args) => {
        entered.resolve();
        await gate.promise;
        return replace(...args);
      },
    );
    const set = deploymentSet(1, artifact, { activation: 'eager' });
    set.deployments.push({
      ...set.deployments[0]!,
      id: 'second',
      appId: 'second',
      artifact: { ...artifact, appId: 'second' },
      basePath: '/second',
    });
    const pending = host.management.applyDeploymentSet(set);
    try {
      await Promise.race([entered.promise, pending]);
      const status = await host.management.getStatus();
      expect(status.deployments.map((item) => item.observedState)).toEqual([
        'pending',
        'pending',
      ]);
    } finally {
      gate.resolve();
      await pending;
    }
    expect(
      (await host.management.getStatus()).deployments.every(
        (item) => item.observedState === 'running',
      ),
    ).toBe(true);
  });

  it('resolves a local artifact and reconciles eager, idempotent, and stopped states', async () => {
    const { deploymentsDir, volumesDir, artifact, artifactDir } =
      await createFixture();
    const host = createAppHost({
      mode: 'managed',
      appDeploymentsDir: deploymentsDir,
      appVolumesDir: volumesDir,
      artifact: fsArtifact(artifactDir),
      evictionIntervalMs: 0,
    });
    hosts.push(host);

    const firstDeploymentSet = deploymentSet(1, artifact, {
      activation: 'eager',
      config: { provider: 'file' },
    });
    const first = await host.management.applyDeploymentSet(firstDeploymentSet);
    expect(first.accepted).toBe(true);
    expect(first.status.deployments[0]).toMatchObject({
      appId: 'customer',
      observedState: 'running',
      revision: 1,
    });
    expect(host.registry.isActive('customer')).toBe(true);
    expect(host.registry.definition('customer')?.rootDir).toBe(
      revisionDirectory(deploymentsDir, artifact),
    );
    expect(host.registry.definition('customer')?.dataDir).toBe(
      path.join(volumesDir, 'customer', 'storage'),
    );
    const configPath = host.registry.definition('customer')?.configPath;
    expect(configPath).toBe(path.join(volumesDir, 'customer', 'config'));

    const repeated =
      await host.management.applyDeploymentSet(firstDeploymentSet);
    expect(repeated.accepted).toBe(false);
    expect(host.registry.snapshot('customer')?.version).toBe(1);

    const sharedConfigPath = path.join(volumesDir, 'shared', 'customer');
    const replaced = await host.management.applyDeploymentSet(
      deploymentSet(2, artifact, {
        activation: 'lazy',
        config: { provider: 'file', path: sharedConfigPath },
      }),
    );
    expect(replaced.status.deployments[0]).toMatchObject({
      observedState: 'running',
    });
    expect(host.registry.definition('customer')?.configPath).toBe(
      sharedConfigPath,
    );
    expect(host.registry.snapshot('customer')?.version).toBe(2);

    const stopped = await host.management.applyDeploymentSet(
      deploymentSet(3, artifact, { desiredState: 'stopped' }),
    );
    expect(stopped.status.deployments[0]?.observedState).toBe('stopped');
    expect(host.registry.has('customer')).toBe(true);
    expect(host.registry.isActive('customer')).toBe(false);

    const started = await host.management.startDeployment({
      ...firstDeploymentSet.deployments[0]!,
      desiredState: 'running',
    });
    expect(started.deployments[0]?.observedState).toBe('running');
    expect(host.registry.isActive('customer')).toBe(true);
  });

  it('applies and removes one managed deployment without a complete set', async () => {
    const { deploymentsDir, volumesDir, artifact, artifactDir } =
      await createFixture();
    const host = createAppHost({
      mode: 'managed',
      appDeploymentsDir: deploymentsDir,
      appVolumesDir: volumesDir,
      artifact: fsArtifact(artifactDir),
      evictionIntervalMs: 0,
    });
    hosts.push(host);
    const deployment = deploymentSet(1, artifact, {
      activation: 'eager',
    }).deployments[0]!;

    const deployed = await host.management.applyDeployment(deployment);
    expect(deployed.deployments[0]).toMatchObject({
      appId: 'customer',
      observedState: 'running',
    });

    const removed = await host.management.removeDeployment('customer');
    expect(removed.deployments).toEqual([]);
    expect(host.registry.has('customer')).toBe(false);
  });

  it('reuses an installed artifact with the same release identity', async () => {
    const fixture = await createFixture();
    const { deploymentsDir, volumesDir, artifact, artifactDir } = fixture;
    const replacement = await createArtifact(fixture, '1.2.4');
    const host = createAppHost({
      mode: 'managed',
      appDeploymentsDir: deploymentsDir,
      appVolumesDir: volumesDir,
      artifact: fsArtifact(artifactDir),
      evictionIntervalMs: 0,
    });
    hosts.push(host);
    const deployment = deploymentSet(1, artifact).deployments[0]!;

    await host.management.applyDeployment(deployment);
    await host.management.applyDeployment(
      deploymentSet(1, replacement).deployments[0]!,
    );
    const publicStorageDir = path.join(
      volumesDir,
      'customer',
      'storage',
      'app',
      'public',
    );
    const publicStorageLink = path.join(
      revisionDirectory(deploymentsDir, artifact),
      'public',
      'storage',
    );
    await mkdir(publicStorageDir, { recursive: true });
    await mkdir(path.dirname(publicStorageLink), { recursive: true });
    await symlink(
      path.relative(path.dirname(publicStorageLink), publicStorageDir),
      publicStorageLink,
      'dir',
    );
    await rm(path.join(artifactDir, artifact.key));

    const repeated = await host.management.applyDeployment(deployment);
    expect(repeated.deployments[0]).toMatchObject({
      appId: 'customer',
      observedState: 'stopped',
      cacheHit: true,
    });
    expect(host.registry.definition('customer')?.rootDir).toBe(
      revisionDirectory(deploymentsDir, artifact),
    );
  });

  it('keeps immutable revisions and retains the three most recently used builds', async () => {
    const fixture = await createFixture();
    const { deploymentsDir, volumesDir, artifactDir } = fixture;
    const host = createAppHost({
      mode: 'managed',
      appDeploymentsDir: deploymentsDir,
      appVolumesDir: volumesDir,
      artifact: fsArtifact(artifactDir),
      evictionIntervalMs: 0,
    });
    hosts.push(host);
    const artifacts = [fixture.artifact];
    for (const version of ['1.2.4', '1.2.5', '1.2.6']) {
      artifacts.push(await createArtifact(fixture, version));
    }

    for (const artifact of artifacts) {
      await host.management.applyDeployment(
        deploymentSet(1, artifact).deployments[0]!,
      );
      expect(host.registry.definition('customer')?.rootDir).toBe(
        revisionDirectory(deploymentsDir, artifact),
      );
    }

    await vi.waitFor(
      async () => {
        expect(
          await revisionNames(deploymentsDir, fixture.artifact.appId),
        ).toHaveLength(3);
      },
      { timeout: 2_000 },
    );
    const retained = await revisionNames(
      deploymentsDir,
      fixture.artifact.appId,
    );
    expect(retained).not.toContain(fixture.artifact.checksum);
    expect(retained).toContain(artifacts.at(-1)?.checksum);

    const rollback = await host.management.applyDeployment(
      deploymentSet(1, fixture.artifact).deployments[0]!,
    );
    expect(rollback.deployments[0]?.observedState).toBe('stopped');
    expect(rollback.deployments[0]?.cacheHit).toBe(false);
    expect(host.registry.definition('customer')?.rootDir).toBe(
      revisionDirectory(deploymentsDir, fixture.artifact),
    );
  });

  it('rejects identity collisions in targeted deployment operations', async () => {
    const { deploymentsDir, volumesDir, artifact, artifactDir } =
      await createFixture();
    const host = createAppHost({
      mode: 'managed',
      appDeploymentsDir: deploymentsDir,
      appVolumesDir: volumesDir,
      artifact: fsArtifact(artifactDir),
      evictionIntervalMs: 0,
    });
    hosts.push(host);
    const deployment = deploymentSet(1, artifact).deployments[0]!;
    await host.management.applyDeployment(deployment);

    await expect(
      host.management.applyDeployment({
        ...deployment,
        appId: 'another-app',
        artifact: { ...deployment.artifact, appId: 'another-app' },
      }),
    ).rejects.toThrow('cannot change app ID');
    await expect(
      host.management.applyDeployment({
        ...deployment,
        id: 'another-deployment',
      }),
    ).rejects.toThrow('already managed by deployment');

    expect((await host.management.getStatus()).desiredRevision).toBe(1);
  });

  it('keeps the previous runtime when a new artifact cannot be resolved', async () => {
    const { deploymentsDir, volumesDir, artifact, artifactDir } =
      await createFixture();
    const host = createAppHost({
      mode: 'managed',
      appDeploymentsDir: deploymentsDir,
      appVolumesDir: volumesDir,
      artifact: fsArtifact(artifactDir),
      evictionIntervalMs: 0,
    });
    hosts.push(host);

    await host.management.applyDeploymentSet(
      deploymentSet(1, artifact, { activation: 'eager' }),
    );
    const activeVersion = host.registry.snapshot('customer')?.version;
    const failed = await host.management.applyDeploymentSet(
      deploymentSet(2, artifact, {
        activation: 'eager',
        artifact: { ...artifact, version: '9.9.9' },
      }),
    );

    expect(failed.status.deployments[0]).toMatchObject({
      observedState: 'failed',
      revision: 2,
    });
    expect(failed.status.deployments[0]?.error).toContain('version mismatch');
    expect(host.registry.snapshot('customer')?.version).toBe(activeVersion);
  });

  it('removes deployments omitted from a newer complete deployment set', async () => {
    const { deploymentsDir, volumesDir, artifact, artifactDir } =
      await createFixture();
    const host = createAppHost({
      mode: 'managed',
      appDeploymentsDir: deploymentsDir,
      appVolumesDir: volumesDir,
      artifact: fsArtifact(artifactDir),
      evictionIntervalMs: 0,
    });
    hosts.push(host);
    await host.management.applyDeploymentSet(
      deploymentSet(1, artifact, { activation: 'eager' }),
    );

    const result = await host.management.applyDeploymentSet({
      revision: 2,
      deployments: [],
    });
    expect(result.status.deployments).toEqual([]);
    expect(host.registry.has('customer')).toBe(false);
  });

  it('registers lazy deployments without starting them', async () => {
    const { deploymentsDir, volumesDir, artifact, artifactDir } =
      await createFixture();
    const host = createAppHost({
      mode: 'managed',
      appDeploymentsDir: deploymentsDir,
      appVolumesDir: volumesDir,
      artifact: fsArtifact(artifactDir),
      evictionIntervalMs: 0,
    });
    hosts.push(host);
    const result = await host.management.applyDeploymentSet(
      deploymentSet(1, artifact),
    );
    expect(result.status.deployments[0]?.observedState).toBe('stopped');
    expect(host.registry.has('customer')).toBe(true);
    expect(host.registry.isActive('customer')).toBe(false);
    expect(host.registry.definition('customer')?.configPath).toBeUndefined();
    await expect(host.management.restartApp('customer')).rejects.toThrow(
      'App "customer" is not running',
    );
  });

  it('restarts only a running deployment', async () => {
    const { deploymentsDir, volumesDir, artifact, artifactDir } =
      await createFixture();
    const host = createAppHost({
      mode: 'managed',
      appDeploymentsDir: deploymentsDir,
      appVolumesDir: volumesDir,
      artifact: fsArtifact(artifactDir),
      evictionIntervalMs: 0,
    });
    hosts.push(host);

    await host.management.applyDeploymentSet(
      deploymentSet(1, artifact, { activation: 'eager' }),
    );
    const before = host.registry.snapshot('customer');
    const status = await host.management.restartApp('customer');
    const after = host.registry.snapshot('customer');

    expect(before).toBeDefined();
    expect(after).toBeDefined();
    expect(after?.version).toBeGreaterThan(before?.version ?? 0);
    expect(status.deployments[0]).toMatchObject({
      appId: 'customer',
      observedState: 'running',
    });
  });

  it('routes a managed deployment by its configured base path', async () => {
    const { deploymentsDir, volumesDir, artifact, artifactDir } =
      await createFixture();
    const host = createAppHost({
      mode: 'managed',
      host: '127.0.0.1',
      port: 0,
      appDeploymentsDir: deploymentsDir,
      appVolumesDir: volumesDir,
      artifact: fsArtifact(artifactDir),
      evictionIntervalMs: 0,
    });
    hosts.push(host);
    await host.start();
    await host.management.applyDeploymentSet(
      deploymentSet(1, artifact, {
        activation: 'eager',
        basePath: '/workspace',
      }),
    );

    const address = host.server.address();
    if (!address || typeof address !== 'object') {
      throw new Error('App host did not expose a TCP address');
    }
    const response = await fetch(
      `http://127.0.0.1:${address.port}/workspace/api/health`,
    );
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('ok');
  });

  it('rejects changed payloads that reuse a revision', async () => {
    const { deploymentsDir, volumesDir, artifact, artifactDir } =
      await createFixture();
    const host = createAppHost({
      mode: 'managed',
      appDeploymentsDir: deploymentsDir,
      appVolumesDir: volumesDir,
      artifact: fsArtifact(artifactDir),
      evictionIntervalMs: 0,
    });
    hosts.push(host);
    await host.management.applyDeploymentSet(deploymentSet(1, artifact));
    await expect(
      host.management.applyDeploymentSet(
        deploymentSet(1, artifact, { activation: 'eager' }),
      ),
    ).rejects.toThrow('revision 1 cannot be changed');
  });

  it('rejects capabilities that are declared but not implemented', async () => {
    const { deploymentsDir, volumesDir, artifact, artifactDir } =
      await createFixture();
    const host = createAppHost({
      mode: 'managed',
      appDeploymentsDir: deploymentsDir,
      appVolumesDir: volumesDir,
      artifact: fsArtifact(artifactDir),
      evictionIntervalMs: 0,
    });
    hosts.push(host);

    await expect(
      host.management.applyDeploymentSet(
        deploymentSet(1, artifact, {
          restartPolicy: 'always',
        } as Partial<HostDeploymentSet['deployments'][number]>),
      ),
    ).rejects.toThrow('Restart policy is not supported');
    await expect(
      host.management.applyDeploymentSet(
        deploymentSet(1, artifact, {
          backend: 'worker',
        } as unknown as Partial<HostDeploymentSet['deployments'][number]>),
      ),
    ).rejects.toThrow('backend "worker" is not supported');
    await expect(
      host.management.applyDeploymentSet(
        deploymentSet(1, artifact, {
          config: { provider: 'file', path: 'relative/config' },
        }),
      ),
    ).rejects.toThrow('Invalid file config');
    expect((await host.management.getStatus()).desiredRevision).toBe(0);
  });

  it('does not expose managed definitions on the application HTTP server', async () => {
    const { deploymentsDir, volumesDir, artifact, artifactDir } =
      await createFixture();
    const host = createAppHost({
      mode: 'managed',
      host: '127.0.0.1',
      port: 0,
      appDeploymentsDir: deploymentsDir,
      appVolumesDir: volumesDir,
      artifact: fsArtifact(artifactDir),
      evictionIntervalMs: 0,
    });
    hosts.push(host);
    await host.start();

    const address = host.server.address();
    if (!address || typeof address !== 'object') {
      throw new Error('App host did not expose a TCP address');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const appsResponse = await fetch(`${baseUrl}/__apps`);
    expect(appsResponse.status).toBe(404);
    const healthResponse = await fetch(`${baseUrl}/__health`);
    expect(healthResponse.status).toBe(503);
    expect(await healthResponse.json()).toEqual({ status: 'not-ready' });

    await host.management.applyDeploymentSet(deploymentSet(1, artifact));
    const readyResponse = await fetch(`${baseUrl}/__ready`);
    expect(readyResponse.status).toBe(200);
    expect(await readyResponse.json()).toEqual({ status: 'ready' });
  });
});

it('deploys a release artifact into app-deployments in standalone mode', async () => {
  const { deploymentsDir, volumesDir, artifact, artifactDir } =
    await createFixture();
  const host = createAppHost({
    mode: 'standalone',
    host: '127.0.0.1',
    port: 0,
    appDeploymentsDir: deploymentsDir,
    appVolumesDir: volumesDir,
    artifact: fsArtifact(artifactDir),
    evictionIntervalMs: 0,
  });
  hosts.push(host);
  await host.start();

  const address = host.server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('App host did not expose a TCP address');
  }
  const response = await fetch(
    `http://127.0.0.1:${address.port}/__apps/customer/deploy`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ artifact }),
    },
  );

  expect(response.status).toBe(200);
  expect(host.registry.isActive('customer')).toBe(true);
  expect(host.registry.definition('customer')?.rootDir).toBe(
    path.join(deploymentsDir, 'customer'),
  );
});

function deploymentSet(
  revision: number,
  artifact: ArtifactReference,
  overrides: Partial<HostDeploymentSet['deployments'][number]> = {},
): HostDeploymentSet {
  return {
    revision,
    deployments: [
      {
        id: 'customer',
        appId: 'customer',
        artifact,
        desiredState: 'running',
        backend: 'in-process',
        activation: 'lazy',
        ...overrides,
      },
    ],
  };
}

async function createFixture(): Promise<{
  deploymentsDir: string;
  volumesDir: string;
  artifactDir: string;
  appRoot: string;
  artifact: ArtifactReference;
}> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'nocobase-managed-'));
  tempDirs.push(rootDir);
  const deploymentsDir = path.join(rootDir, 'apps');
  const volumesDir = path.join(rootDir, 'app-volumes');
  const artifactDir = path.join(rootDir, 'artifacts');
  const sourceDir = path.join(rootDir, 'source');
  const appRoot = path.join(sourceDir, 'customer');
  await mkdir(path.join(appRoot, 'dist', 'server'), { recursive: true });
  await writeFile(
    path.join(appRoot, 'package.json'),
    JSON.stringify({
      name: '@example/customer',
      version: '1.2.3',
      type: 'module',
    }),
  );
  await writeFile(
    path.join(appRoot, 'dist', 'server', 'embedded.js'),
    'export function createServer() { return { fetch() { return new Response("ok"); } }; }',
  );
  await writeFile(path.join(appRoot, 'config.yaml'), 'enabled: true\n');
  await mkdir(path.join(appRoot, 'storage'), { recursive: true });
  await writeFile(path.join(appRoot, 'storage', 'seed.txt'), 'seed\n');
  await mkdir(path.join(artifactDir, 'releases', 'customer'), {
    recursive: true,
  });
  const fixture = {
    deploymentsDir,
    volumesDir,
    artifactDir,
    appRoot,
    artifact: {} as ArtifactReference,
  };
  fixture.artifact = await createArtifact(fixture, '1.2.3');
  return fixture;
}

async function createArtifact(
  fixture: { artifactDir: string; appRoot: string },
  version: string,
): Promise<ArtifactReference> {
  await writeFile(
    path.join(fixture.appRoot, 'package.json'),
    JSON.stringify({
      name: '@example/customer',
      version,
      type: 'module',
    }),
  );
  const key = `releases/customer/${version}.tar.gz`;
  const archivePath = path.join(fixture.artifactDir, key);
  await createTar({ cwd: fixture.appRoot, file: archivePath, gzip: true }, [
    '.',
  ]);
  const checksum = createHash('sha256')
    .update(await readFile(archivePath))
    .digest('hex');
  return { key, appId: 'customer', version, checksum };
}

function revisionDirectory(
  deploymentsDir: string,
  artifact: ArtifactReference,
): string {
  return path.join(
    deploymentsDir,
    artifact.appId,
    'revisions',
    artifact.checksum.toLowerCase(),
  );
}

async function revisionNames(
  deploymentsDir: string,
  appId: string,
): Promise<string[]> {
  return (
    await readdir(path.join(deploymentsDir, appId, 'revisions'), {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name))
    .map((entry) => entry.name);
}

function fsArtifact(location: string) {
  return { driver: 'fs' as const, location, visibility: 'private' as const };
}
