/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { createAppHost, loadAppHostConfig } from '../dist/index.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

it('writes production host logs under storage/host/logs', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'app-host-logging-'));
  directories.push(rootDir);
  const config = await loadAppHostConfig({
    rootDir,
    environment: { NODE_ENV: 'production' },
  });
  const host = createAppHost({
    mode: config.mode,
    appDeploymentsDir: config.appDeploymentsDir,
    appVolumesDir: config.appVolumesDir,
    artifact: config.artifact,
    logging: config.logging,
    evictionIntervalMs: 0,
  });

  host.logger.info({ event: 'host:test' }, 'Host logging test');
  await host.close('test cleanup');

  const logDir = path.join(rootDir, 'storage', 'host', 'logs');
  let files: string[] = [];
  await vi.waitFor(async () => {
    files = await readdir(logDir);
    expect(files).toEqual([
      expect.stringMatching(/^host\.\d{4}_\d{2}_\d{2}\.1\.log$/),
    ]);
  });
  const content = await readFile(path.join(logDir, files[0]), 'utf8');
  expect(content).toContain('"event":"host:test"');
  expect(content).toContain('"msg":"Host logging test"');
});
