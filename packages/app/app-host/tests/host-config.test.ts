/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadAppHostConfig, resolveAppHostConfigPath } from '../dist/index.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('loadAppHostConfig', () => {
  it('loads the host namespace from JSON and applies environment overrides', async () => {
    const rootDir = await createTempDirectory();
    await writeFile(
      path.join(rootDir, 'custom.json'),
      JSON.stringify({
        host: {
          mode: 'managed',
          server: { host: '0.0.0.0', port: 13010 },
          artifact: {
            driver: 'fs',
            location: './storage/releases',
            visibility: 'private',
          },
          appDeploymentsDir: './storage/apps',
          appVolumesDir: './storage/volumes',
        },
      }),
    );

    const config = await loadAppHostConfig({
      rootDir,
      configPath: 'custom.json',
      environment: { APP_HOST_PORT: '14010' },
    });

    expect(config).toMatchObject({
      mode: 'managed',
      server: { host: '0.0.0.0', port: 14010 },
      artifact: {
        driver: 'fs',
        location: path.join(rootDir, 'storage/releases'),
      },
      appDeploymentsDir: path.join(rootDir, 'storage/apps'),
      appVolumesDir: path.join(rootDir, 'storage/volumes'),
    });
  });

  it('discovers YAML, YAML long extension, and JSON in that order', async () => {
    const rootDir = await createTempDirectory();
    expect(resolveAppHostConfigPath(path.join(rootDir, 'config'))).toBe(
      path.join(rootDir, 'config.yml'),
    );
    await writeFile(path.join(rootDir, 'config.json'), '{}');
    expect(resolveAppHostConfigPath(path.join(rootDir, 'config'))).toBe(
      path.join(rootDir, 'config.json'),
    );
    await writeFile(path.join(rootDir, 'config.yaml'), '{}');
    expect(resolveAppHostConfigPath(path.join(rootDir, 'config'))).toBe(
      path.join(rootDir, 'config.yaml'),
    );
    await writeFile(path.join(rootDir, 'config.yml'), '{}');
    expect(resolveAppHostConfigPath(path.join(rootDir, 'config'))).toBe(
      path.join(rootDir, 'config.yml'),
    );
  });

  it('uses the default artifacts, deployments, and volumes directories', async () => {
    const rootDir = await createTempDirectory();
    const config = await loadAppHostConfig({ rootDir, environment: {} });

    expect(config.artifact).toMatchObject({
      driver: 'fs',
      location: path.join(rootDir, 'storage/app-artifacts'),
    });
    expect(config.appDeploymentsDir).toBe(
      path.join(rootDir, 'storage/app-deployments'),
    );
    expect(config.appVolumesDir).toBe(
      path.join(rootDir, 'storage/app-volumes'),
    );
  });
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'app-host-config-'));
  directories.push(directory);
  return directory;
}
