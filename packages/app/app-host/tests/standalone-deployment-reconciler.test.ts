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
import { AppRuntimeRegistry } from '../dist/app-registry.js';
import {
  DeploymentCatalog,
  StandaloneDeploymentReconciler,
} from '../dist/deployment/index.js';

const tempDirs: string[] = [];
const registries: AppRuntimeRegistry[] = [];

async function writeDeployment(
  deploymentsDir: string,
  appId: string,
  version: string,
): Promise<string> {
  const rootDir = path.join(deploymentsDir, appId);
  await mkdir(path.join(rootDir, 'dist', 'server'), { recursive: true });
  await writeFile(
    path.join(rootDir, 'package.json'),
    JSON.stringify({ name: appId, version, type: 'module' }),
  );
  await writeFile(
    path.join(rootDir, 'dist', 'server', 'embedded.js'),
    'export function createServer() { return { fetch: () => new Response("ok") }; }\n',
  );
  return rootDir;
}

afterEach(async () => {
  await Promise.all(
    registries.splice(0).map((registry) => registry.destroyAll('test cleanup')),
  );
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe('StandaloneDeploymentReconciler', () => {
  it('registers, updates, and removes deployments', async () => {
    const deploymentsDir = await mkdtemp(
      path.join(os.tmpdir(), 'nocobase-standalone-deployments-'),
    );
    tempDirs.push(deploymentsDir);
    const appDir = await writeDeployment(deploymentsDir, 'customer', '1.0.0');
    const registry = new AppRuntimeRegistry({ startEvictionLoop: false });
    registries.push(registry);
    const reconciler = new StandaloneDeploymentReconciler(
      new DeploymentCatalog({ deploymentsDir }),
      registry,
    );

    const registered = await reconciler.reconcile();
    expect(registered.registered.map((definition) => definition.id)).toEqual([
      'customer',
    ]);

    await writeDeployment(deploymentsDir, 'customer', '2.0.0');
    const updated = await reconciler.reconcile();
    expect(updated.updated).toMatchObject([
      { id: 'customer', desiredVersion: '2.0.0' },
    ]);

    await rm(appDir, { recursive: true });
    const removed = await reconciler.reconcile();
    expect(removed.removed.map((definition) => definition.id)).toEqual([
      'customer',
    ]);
    expect(registry.definition('customer')).toBeUndefined();
  });
});
