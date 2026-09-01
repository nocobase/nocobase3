/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { c as createTar } from 'tar';
import {
  ConfigMaterializer,
  createAppHost,
  type AppHost,
  type HostDeploymentSnapshot,
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

    const firstSnapshot = snapshot(1, artifact, {
      activation: 'eager',
      config: { revision: '1', value: { database: { dialect: 'sqlite' } } },
    });
    const first = await host.management.applySnapshot(firstSnapshot);
    expect(first.accepted).toBe(true);
    expect(first.status.deployments[0]).toMatchObject({
      appId: 'customer',
      observedState: 'running',
      generation: 1,
      configRevision: '1',
    });
    expect(host.registry.isActive('customer')).toBe(true);
    expect(host.registry.definition('customer')?.rootDir).toContain(
      path.join(deploymentsDir, 'customer'),
    );
    expect(host.registry.definition('customer')?.dataDir).toBe(
      path.join(volumesDir, 'customer', 'storage'),
    );
    const configPath = host.registry.definition('customer')?.configPath;
    expect(configPath).toBe(path.join(volumesDir, 'customer', 'config.yml'));
    await expect(readFile(configPath!, 'utf8')).resolves.toContain('sqlite');

    const repeated = await host.management.applySnapshot(firstSnapshot);
    expect(repeated.accepted).toBe(false);
    expect(host.registry.snapshot('customer')?.version).toBe(1);

    const replaced = await host.management.applySnapshot(
      snapshot(2, artifact, {
        activation: 'lazy',
        config: { revision: '2', value: { database: { dialect: 'postgres' } } },
      }),
    );
    expect(replaced.status.deployments[0]).toMatchObject({
      observedState: 'running',
      configRevision: '2',
    });
    await expect(readFile(configPath!, 'utf8')).resolves.toContain('postgres');
    await expect(
      readFile(path.join(deploymentsDir, 'customer', 'config.yml'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(host.registry.snapshot('customer')?.version).toBe(2);

    const stopped = await host.management.applySnapshot(
      snapshot(3, artifact, { desiredState: 'stopped' }),
    );
    expect(stopped.status.deployments[0]?.observedState).toBe('stopped');
    expect(host.registry.has('customer')).toBe(false);
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

    await host.management.applySnapshot(
      snapshot(1, artifact, { activation: 'eager' }),
    );
    const activeVersion = host.registry.snapshot('customer')?.version;
    const failed = await host.management.applySnapshot(
      snapshot(2, artifact, {
        activation: 'eager',
        artifact: { ...artifact, version: '9.9.9' },
      }),
    );

    expect(failed.status.deployments[0]).toMatchObject({
      observedState: 'failed',
      generation: 2,
    });
    expect(failed.status.deployments[0]?.error).toContain('version mismatch');
    expect(host.registry.snapshot('customer')?.version).toBe(activeVersion);
  });

  it('removes deployments omitted from a newer complete snapshot', async () => {
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
    await host.management.applySnapshot(
      snapshot(1, artifact, { activation: 'eager' }),
    );

    const result = await host.management.applySnapshot({
      generation: 2,
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
    const result = await host.management.applySnapshot(snapshot(1, artifact));
    expect(result.status.deployments[0]?.observedState).toBe('registered');
    expect(host.registry.has('customer')).toBe(true);
    expect(host.registry.isActive('customer')).toBe(false);
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
    await host.management.applySnapshot(
      snapshot(1, artifact, { activation: 'eager', basePath: '/workspace' }),
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

  it('rejects changed payloads that reuse a generation', async () => {
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
    await host.management.applySnapshot(snapshot(1, artifact));
    await expect(
      host.management.applySnapshot(
        snapshot(1, artifact, { activation: 'eager' }),
      ),
    ).rejects.toThrow('generation 1 cannot be changed');
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
      host.management.applySnapshot(
        snapshot(1, artifact, {
          restartPolicy: 'always',
        } as Partial<HostDeploymentSnapshot['deployments'][number]>),
      ),
    ).rejects.toThrow('Restart policy is not supported');
    await expect(
      host.management.applySnapshot(
        snapshot(1, artifact, {
          backend: 'worker',
        } as unknown as Partial<HostDeploymentSnapshot['deployments'][number]>),
      ),
    ).rejects.toThrow('backend "worker" is not supported');
    expect((await host.management.getStatus()).desiredGeneration).toBe(0);
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

    await host.management.applySnapshot(snapshot(1, artifact));
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

it('keeps materialized config revisions immutable', async () => {
  const volumesDir = await mkdtemp(path.join(os.tmpdir(), 'nocobase-config-'));
  tempDirs.push(volumesDir);
  const materializer = new ConfigMaterializer(volumesDir);
  await materializer.materialize('customer', {
    revision: '1',
    value: { enabled: true },
  });
  await expect(
    materializer.materialize('customer', {
      revision: '1',
      value: { enabled: false },
    }),
  ).rejects.toThrow('is immutable');
});

function snapshot(
  generation: number,
  artifact: ArtifactReference,
  overrides: Partial<HostDeploymentSnapshot['deployments'][number]> = {},
): HostDeploymentSnapshot {
  return {
    generation,
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
  await mkdir(path.join(artifactDir, 'releases', 'customer'), {
    recursive: true,
  });
  const key = 'releases/customer/1.2.3.tar.gz';
  const archivePath = path.join(artifactDir, key);
  await createTar({ cwd: appRoot, file: archivePath, gzip: true }, ['.']);
  const checksum = createHash('sha256')
    .update(await readFile(archivePath))
    .digest('hex');
  return {
    deploymentsDir,
    volumesDir,
    artifactDir,
    artifact: { key, appId: 'customer', version: '1.2.3', checksum },
  };
}

function fsArtifact(location: string) {
  return { driver: 'fs' as const, location, visibility: 'private' as const };
}
