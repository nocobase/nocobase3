/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DeploymentCatalog } from '../dist/deployment/catalog.js';

const tempDirs: string[] = [];

async function createAppWorkspace(
  files: string[],
  packageJson: string | null = '{"name":"customer-app","version":"1.0.0"}\n',
) {
  const deploymentsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-deployment-catalog-'),
  );
  tempDirs.push(deploymentsDir);

  const appDir = path.join(deploymentsDir, 'customer');
  await mkdir(appDir, { recursive: true });
  if (packageJson) {
    await writeFile(path.join(appDir, 'package.json'), packageJson);
  }

  for (const file of files) {
    const target = path.join(appDir, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'export const marker = true;\n');
  }

  return { deploymentsDir, appDir };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe('DeploymentCatalog', () => {
  it('discovers an app from dist/server/embedded.js', async () => {
    const { deploymentsDir, appDir } = await createAppWorkspace(
      ['dist/server/embedded.js'],
      null,
    );
    const catalog = new DeploymentCatalog({ deploymentsDir });

    await expect(catalog.discover()).resolves.toMatchObject([
      {
        id: 'customer',
        basePath: '/customer',
        server: {
          rootDir: appDir,
          entrypoint: 'dist/server/embedded.js',
        },
        client: undefined,
        desiredVersion: 'local',
      },
    ]);
  });

  it('always points standalone apps at their volume config and storage', async () => {
    const { deploymentsDir } = await createAppWorkspace([
      'dist/server/embedded.js',
    ]);
    const volumesDir = path.join(deploymentsDir, '..', 'volumes');
    const catalog = new DeploymentCatalog({ deploymentsDir, volumesDir });

    await expect(catalog.discover()).resolves.toMatchObject([
      {
        id: 'customer',
        configPath: path.join(volumesDir, 'customer', 'config'),
        dataDir: path.join(volumesDir, 'customer', 'storage'),
      },
    ]);
  });

  it('discovers client assets as optional app artifacts', async () => {
    const { deploymentsDir, appDir } = await createAppWorkspace([
      'dist/client/index.html',
      'dist/client/assets/app.js',
      'dist/server/embedded.js',
    ]);
    const catalog = new DeploymentCatalog({ deploymentsDir });

    await expect(catalog.discover()).resolves.toMatchObject([
      {
        id: 'customer',
        server: {
          rootDir: appDir,
          entrypoint: 'dist/server/embedded.js',
        },
        client: {
          rootDir: path.join(appDir, 'dist', 'client'),
          index: 'index.html',
          assetsDir: path.join(appDir, 'dist', 'client', 'assets'),
        },
      },
    ]);
  });

  it('does not discover a client-only app', async () => {
    const { deploymentsDir } = await createAppWorkspace([
      'dist/client/index.html',
      'dist/client/assets/app.js',
    ]);
    const catalog = new DeploymentCatalog({ deploymentsDir });

    await expect(catalog.discover()).resolves.toEqual([]);
  });

  it('uses the standard dist server entrypoint when package app metadata is omitted', async () => {
    const { deploymentsDir, appDir } = await createAppWorkspace([
      'dist/client/index.html',
      'dist/server/embedded.js',
      'server/app.ts',
    ]);
    const catalog = new DeploymentCatalog({ deploymentsDir });

    await expect(catalog.discover()).resolves.toMatchObject([
      {
        id: 'customer',
        server: {
          rootDir: appDir,
          entrypoint: 'dist/server/embedded.js',
        },
      },
    ]);
  });

  it('does not treat source server files as app-dist server artifacts', async () => {
    const { deploymentsDir } = await createAppWorkspace([
      'dist/client/index.html',
      'server/index.ts',
      'server/app.ts',
    ]);
    const catalog = new DeploymentCatalog({ deploymentsDir });

    await expect(catalog.discover()).resolves.toEqual([]);
  });

  it('uses the directory path as app identity when package app metadata is stale', async () => {
    const { deploymentsDir } = await createAppWorkspace(
      ['dist/client/index.html', 'dist/server/embedded.js'],
      JSON.stringify(
        {
          name: 'customer-app',
          version: '1.0.0',
          app: {
            appName: 'main',
          },
        },
        null,
        2,
      ),
    );
    const catalog = new DeploymentCatalog({ deploymentsDir });

    await expect(catalog.discover()).resolves.toMatchObject([
      {
        id: 'customer',
        appName: 'customer',
        basePath: '/customer',
        server: {
          entrypoint: 'dist/server/embedded.js',
        },
      },
    ]);
  });

  it('ignores nested app directories', async () => {
    const deploymentsDir = await mkdtemp(
      path.join(os.tmpdir(), 'nocobase-deployment-catalog-'),
    );
    tempDirs.push(deploymentsDir);

    const nestedAppDir = path.join(deploymentsDir, 'main', 'customer');
    await mkdir(path.join(nestedAppDir, 'dist', 'server'), { recursive: true });
    await writeFile(
      path.join(nestedAppDir, 'package.json'),
      '{"name":"customer-app","version":"1.0.0"}\n',
    );
    await writeFile(
      path.join(nestedAppDir, 'dist', 'server', 'embedded.js'),
      'export const marker = true;\n',
    );

    const catalog = new DeploymentCatalog({ deploymentsDir });

    await expect(catalog.discover()).resolves.toEqual([]);
  });
});
