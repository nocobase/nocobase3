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
import { DirectoryAppCatalog } from '../dist/app-catalog.js';
import { parseReleaseManifest } from '../dist/app-release.js';

const tempDirs: string[] = [];
const markerArtifactSha256 =
  'e06dc1347130ccb7aae4f769bae5b6de900e01468e1e1d6029abf43943bb2858';

async function createAppWorkspace(
  files: string[],
  packageJson: string | null = '{"name":"customer-app","version":"1.0.0"}\n',
) {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-catalog-'),
  );
  tempDirs.push(appsDir);

  const appDir = path.join(appsDir, 'customer');
  await mkdir(appDir, { recursive: true });
  if (packageJson) {
    await writeFile(path.join(appDir, 'package.json'), packageJson);
  }

  for (const file of files) {
    const target = path.join(appDir, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'export const marker = true;\n');
  }

  return { appsDir, appDir };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe('DirectoryAppCatalog', () => {
  it('discovers an app from dist/server/embedded.js', async () => {
    const { appsDir, appDir } = await createAppWorkspace(
      ['dist/server/embedded.js'],
      null,
    );
    const catalog = new DirectoryAppCatalog({ appsDir });

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

  it('discovers client assets as optional app artifacts', async () => {
    const { appsDir, appDir } = await createAppWorkspace([
      'dist/client/index.html',
      'dist/client/assets/app.js',
      'dist/server/embedded.js',
    ]);
    const catalog = new DirectoryAppCatalog({ appsDir });

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
    const { appsDir } = await createAppWorkspace([
      'dist/client/index.html',
      'dist/client/assets/app.js',
    ]);
    const catalog = new DirectoryAppCatalog({ appsDir });

    await expect(catalog.discover()).resolves.toEqual([]);
  });

  it('uses the standard dist server entrypoint when package app metadata is omitted', async () => {
    const { appsDir, appDir } = await createAppWorkspace([
      'dist/client/index.html',
      'dist/server/embedded.js',
      'server/app.ts',
    ]);
    const catalog = new DirectoryAppCatalog({ appsDir });

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
    const { appsDir } = await createAppWorkspace([
      'dist/client/index.html',
      'server/index.ts',
      'server/app.ts',
    ]);
    const catalog = new DirectoryAppCatalog({ appsDir });

    await expect(catalog.discover()).resolves.toEqual([]);
  });

  it('uses the directory path as app identity when package app metadata is stale', async () => {
    const { appsDir } = await createAppWorkspace(
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
    const catalog = new DirectoryAppCatalog({ appsDir });

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

  it('discovers a user-facing display name from package metadata', async () => {
    const { appsDir } = await createAppWorkspace(
      ['dist/client/index.html', 'dist/server/embedded.js'],
      JSON.stringify({
        name: '@nocobase/app-orders',
        displayName: '订单运营中心',
        version: '1.0.0',
        app: { displayName: '订单运营中心' },
      }),
    );
    const catalog = new DirectoryAppCatalog({ appsDir });

    await expect(catalog.discover()).resolves.toMatchObject([
      {
        id: 'customer',
        displayName: '订单运营中心',
      },
    ]);
  });

  it('ignores nested app directories', async () => {
    const appsDir = await mkdtemp(
      path.join(os.tmpdir(), 'nocobase-app-catalog-'),
    );
    tempDirs.push(appsDir);

    const nestedAppDir = path.join(appsDir, 'main', 'customer');
    await mkdir(path.join(nestedAppDir, 'dist', 'server'), { recursive: true });
    await writeFile(
      path.join(nestedAppDir, 'package.json'),
      '{"name":"customer-app","version":"1.0.0"}\n',
    );
    await writeFile(
      path.join(nestedAppDir, 'dist', 'server', 'embedded.js'),
      'export const marker = true;\n',
    );

    const catalog = new DirectoryAppCatalog({ appsDir });

    await expect(catalog.discover()).resolves.toEqual([]);
  });

  it('resolves an immutable release with app-owned persistent data', async () => {
    const { appsDir, appDir } = await createAppWorkspace([]);
    const releaseDir = path.join(appDir, 'releases', 'release-v1');
    await mkdir(path.join(releaseDir, 'dist', 'server'), { recursive: true });
    await writeFile(
      path.join(releaseDir, 'dist', 'server', 'embedded.js'),
      'export const marker = true;\n',
    );
    await writeFile(
      path.join(releaseDir, 'app-release.json'),
      JSON.stringify({
        schemaVersion: 1,
        appId: 'customer',
        releaseId: 'release-v1',
        version: '1.0.0',
        artifactSha256: markerArtifactSha256,
        runtime: { healthPath: '/healthz' },
      }),
    );
    const catalog = new DirectoryAppCatalog({ appsDir });

    await expect(
      catalog.resolveRelease('customer', 'release-v1'),
    ).resolves.toMatchObject({
      id: 'customer',
      desiredVersion: '1.0.0',
      rootDir: releaseDir,
      dataDir: path.join(appDir, 'data'),
      release: {
        id: 'release-v1',
        releaseDir,
        checksum: markerArtifactSha256,
      },
      healthPath: '/healthz',
    });
  });
});

describe('parseReleaseManifest', () => {
  it('normalizes valid release metadata', () => {
    expect(
      parseReleaseManifest(
        JSON.stringify({
          schemaVersion: 1,
          appId: 'orders',
          releaseId: 'release-v2',
          version: '2.0.0',
          artifactSha256: markerArtifactSha256,
          createdAt: '2026-08-18T08:00:00+08:00',
          runtime: {
            backend: 'in-process',
            healthPath: '/healthz',
            resourcePolicy: { startupTimeoutMs: 5000 },
          },
        }),
      ),
    ).toMatchObject({
      appId: 'orders',
      releaseId: 'release-v2',
      version: '2.0.0',
      artifactSha256: markerArtifactSha256,
      createdAt: '2026-08-18T00:00:00.000Z',
    });
  });

  it.each([
    [
      { schemaVersion: 2, appId: 'orders', version: '1.0.0' },
      'schemaVersion 1',
    ],
    [
      { schemaVersion: 1, appId: '../orders', version: '1.0.0' },
      'safe path segment',
    ],
    [
      {
        schemaVersion: 1,
        appId: 'orders',
        version: '1.0.0',
        createdAt: 'not-a-date',
      },
      'ISO date',
    ],
    [
      {
        schemaVersion: 1,
        appId: 'orders',
        version: '1.0.0',
        runtime: { healthPath: '//attacker' },
      },
      'absolute path',
    ],
    [
      {
        schemaVersion: 1,
        appId: 'orders',
        version: '1.0.0',
        runtime: { resourcePolicy: { startupTimeoutMs: 0 } },
      },
      'positive number',
    ],
    [
      {
        schemaVersion: 1,
        appId: 'orders',
        version: '1.0.0',
        artifactSha256: 'not-a-checksum',
      },
      'SHA-256 hex digest',
    ],
  ])('rejects malformed or unsafe manifests', (manifest, message) => {
    expect(() => parseReleaseManifest(JSON.stringify(manifest))).toThrow(
      message,
    );
  });
});
