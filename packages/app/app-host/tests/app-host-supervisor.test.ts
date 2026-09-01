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
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { c as createTar } from 'tar';
import type { ArtifactReference } from '../dist/index.js';
import { sanitizeAppHostChildNodeOptions } from '../dist/supervisor.js';
import { AppHostSupervisor } from '../dist/supervisor.js';

describe('AppHostSupervisor', () => {
  it('removes preserve symlink flags from app-host child NODE_OPTIONS', () => {
    expect(
      sanitizeAppHostChildNodeOptions(
        '--preserve-symlinks --max_old_space_size=4096 --preserve-symlinks-main=true',
      ),
    ).toBe('--max_old_space_size=4096');
  });

  it('removes empty NODE_OPTIONS when only preserve symlink flags are present', () => {
    expect(
      sanitizeAppHostChildNodeOptions(
        '--preserve-symlinks --preserve-symlinks-main',
      ),
    ).toBe('');
  });

  it('manages a spawned host through authenticated IPC', async () => {
    AppHostSupervisor.resetInstance();
    const volumesDir = await mkdtemp(path.join(os.tmpdir(), 'app-host-data-'));
    const fixture = await createManagedFixture(volumesDir);
    const supervisor = AppHostSupervisor.getInstance({
      mode: 'managed',
      driver: 'tsx',
      appDeploymentsDir: fixture.appDeploymentsDir,
      appVolumesDir: fixture.appVolumesDir,
      configPath: fixture.configPath,
      startTimeoutMs: 10_000,
    });
    try {
      await supervisor.ensureStarted();
      const management = await supervisor.getManagementClient();
      const capabilities = await management.getCapabilities();
      expect(capabilities).toMatchObject({
        mode: 'managed',
        protocolVersion: 1,
        backends: ['in-process'],
      });

      const result = await supervisor.applySnapshot({
        generation: 1,
        deployments: [
          {
            id: 'demo',
            appId: 'demo',
            artifact: fixture.artifact,
            desiredState: 'running',
            backend: 'in-process',
            activation: 'eager',
          },
        ],
      });
      expect(result.status.deployments[0]).toMatchObject({
        appId: 'demo',
        observedState: 'running',
      });

      await supervisor.restart('test restart');
      const recovered = await (
        await supervisor.getManagementClient()
      ).getStatus();
      expect(recovered).toMatchObject({
        desiredGeneration: 1,
        reconciledGeneration: 1,
      });
      expect(recovered.deployments[0]).toMatchObject({
        appId: 'demo',
        observedState: 'running',
      });
    } finally {
      await supervisor.shutdown();
      AppHostSupervisor.resetInstance();
      await rm(volumesDir, { recursive: true, force: true });
    }
  });

  it('restarts a crashed managed host and replays its snapshot', async () => {
    AppHostSupervisor.resetInstance();
    const volumesDir = await mkdtemp(path.join(os.tmpdir(), 'app-host-data-'));
    const fixture = await createManagedFixture(volumesDir);
    const supervisor = AppHostSupervisor.getInstance({
      mode: 'managed',
      driver: 'tsx',
      appDeploymentsDir: fixture.appDeploymentsDir,
      appVolumesDir: fixture.appVolumesDir,
      configPath: fixture.configPath,
      startTimeoutMs: 10_000,
      automaticRestartBaseDelayMs: 10,
      maxAutomaticRestarts: 3,
    });
    try {
      await supervisor.applySnapshot({
        generation: 1,
        deployments: [
          {
            id: 'demo',
            appId: 'demo',
            artifact: fixture.artifact,
            desiredState: 'running',
            backend: 'in-process',
            activation: 'eager',
          },
        ],
      });
      const previousPid = supervisor.getInfo().pid;
      if (!previousPid) {
        throw new Error('Managed app-host has no process ID');
      }
      process.kill(previousPid, 'SIGKILL');

      await waitUntil(
        () =>
          supervisor.getStatus() === 'ready' &&
          supervisor.getInfo().pid !== previousPid,
        10_000,
      );
      const recovered = await (
        await supervisor.getManagementClient()
      ).getStatus();
      expect(recovered).toMatchObject({
        ready: true,
        desiredGeneration: 1,
        reconciledGeneration: 1,
      });
    } finally {
      await supervisor.shutdown();
      AppHostSupervisor.resetInstance();
      await rm(volumesDir, { recursive: true, force: true });
    }
  });
});

async function createManagedFixture(rootDir: string): Promise<{
  appDeploymentsDir: string;
  appVolumesDir: string;
  configPath: string;
  artifact: ArtifactReference;
}> {
  const sourceDir = fileURLToPath(
    new URL('../fixtures/app-dist/demo', import.meta.url),
  );
  const artifactDir = path.join(rootDir, 'app-artifacts');
  const appDeploymentsDir = path.join(rootDir, 'app-deployments');
  const appVolumesDir = path.join(rootDir, 'app-volumes');
  const key = 'releases/demo/0.0.1.tar.gz';
  const archivePath = path.join(artifactDir, key);
  await mkdir(path.dirname(archivePath), { recursive: true });
  await createTar({ cwd: sourceDir, file: archivePath, gzip: true }, ['.']);
  const checksum = createHash('sha256')
    .update(await readFile(archivePath))
    .digest('hex');
  const configPath = path.join(rootDir, 'host.json');
  await writeFile(
    configPath,
    JSON.stringify({
      host: {
        mode: 'managed',
        server: { host: '127.0.0.1', port: 13010 },
        artifact: {
          driver: 'fs',
          location: artifactDir,
          visibility: 'private',
        },
        appDeploymentsDir,
        appVolumesDir,
      },
    }),
  );
  return {
    appDeploymentsDir,
    appVolumesDir,
    configPath,
    artifact: { key, appId: 'demo', version: '0.0.1', checksum },
  };
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Condition was not met within ${timeoutMs}ms`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
}
