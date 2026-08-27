/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AppHostSupervisor,
  type AppHostLease,
  sanitizeAppHostChildEnvironment,
  sanitizeAppHostChildNodeOptions,
} from '../dist/supervisor.js';

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

  it('does not leak Hub or Portal secrets into the App Host child', () => {
    expect(
      sanitizeAppHostChildEnvironment({
        AUTH_SECRET: 'hub-secret',
        HUB_DATABASE_PATH: '/private/hub.sqlite',
        NOCOBASE_AUTH_URL: 'https://example.com/hub/api/auth',
        APP_BASE_PATH: '/hub',
        APP_HOST_PUBLIC_URL: 'https://example.com/',
        NODE_ENV: 'production',
        PATH: '/usr/bin',
      }),
    ).toEqual({
      APP_HOST_PUBLIC_URL: 'https://example.com/',
      NODE_ENV: 'production',
      PATH: '/usr/bin',
    });
  });

  it.each(['node', 'tsx'] as const)(
    'starts the App Host with the %s driver',
    async (driver) => {
      const appDistDir = await mkdtemp(
        path.join(tmpdir(), 'nocobase-app-host-supervisor-'),
      );
      let supervisor: AppHostSupervisor | undefined;
      let lease: AppHostLease | undefined;

      try {
        supervisor = AppHostSupervisor.getInstance({
          driver,
          appDistDir,
          host: '127.0.0.1',
          port: await findAvailableTestPort(),
          startTimeoutMs: 15_000,
          shutdownTimeoutMs: 5_000,
        });
        lease = await supervisor.acquire();
        const response = await fetch(new URL('/__health', lease.targetUrl));

        expect(response.status).toBe(200);
        expect(supervisor.getInfo()).toMatchObject({
          driver,
          status: 'ready',
          activeLeases: 1,
        });
      } finally {
        lease?.release();
        if (supervisor) {
          await supervisor.shutdown();
          AppHostSupervisor.resetInstance();
        }
        await rm(appDistDir, { recursive: true, force: true });
      }
    },
    20_000,
  );
});

async function findAvailableTestPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to allocate a test port'));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}
