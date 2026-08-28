// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createReleaseManagementApiPlugin,
  RELEASE_MANAGEMENT_API_PLUGIN_ID,
} from '../server/index.ts';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('release management API plugin', () => {
  it('owns both managed App and release-management API routes', async () => {
    const storeDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'nocobase-release-plugin-'),
    );
    tempDirs.push(storeDirectory);
    const plugin = createReleaseManagementApiPlugin({
      appHostUrl: 'http://app-host.internal:13010',
      storePath: path.join(storeDirectory, 'deployments.json'),
    });
    const api = new Hono();

    plugin.registerApiRoutes(api);

    expect(plugin.id).toBe(RELEASE_MANAGEMENT_API_PLUGIN_ID);
    for (const route of ['/apps', '/release-management/overview']) {
      const response = await api.request(`http://localhost${route}`);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        code: 'RELEASE_AUTH_NOT_CONFIGURED',
      });
    }
  });
});
