// @vitest-environment node

import { fileURLToPath } from 'node:url';

import { appConfig } from '@nocobase/app-server/config';
import { databaseConfig } from '@nocobase/app-server/database';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import {
  cachingConfig,
  driveConfig,
  loggingConfig,
  queueConfig,
  sessionConfig,
} from '@nocobase/app-server';
import { describe, expect, it } from 'vitest';

import appRuntime from '../../server/runtime.ts';

const templateRootDir = fileURLToPath(new URL('../..', import.meta.url));

describe('application config', () => {
  it('loads module definitions through the runtime registry', async () => {
    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      rootDir: templateRootDir,
      env: { AUTH_SECRET: 'test-auth-secret-at-least-32-characters' },
    });

    expect(runtime.appConfig.get(appConfig).name).toBe('main');
    expect(runtime.appConfig.get(cachingConfig).default).toBe('memory');
    expect(runtime.appConfig.get(databaseConfig).default).toBe('main');
    const drive = runtime.appConfig.get(driveConfig);
    expect(drive.default).toBe('local');
    expect(drive.disks.local).toEqual({
      driver: 'fs',
      location: fileURLToPath(new URL('../../storage', import.meta.url)),
      visibility: 'private',
    });
    expect(drive.disks.public).toBeUndefined();
    expect(runtime.appConfig.get(loggingConfig).default).toBe('system');
    expect(runtime.appConfig.get(queueConfig).default).toBe('sync');
    expect(runtime.appConfig.get(queueConfig).jobs?.locations).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /app-plugin-ai-knowledge-base\/server\/jobs\/\*\*\/\*\.\{ts,js,mts,mjs\}$/,
        ),
      ]),
    );
    expect(runtime.appConfig.get(sessionConfig).default).toBe('memory');
  });

  it('reloads a file-backed configuration explicitly', async () => {
    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      rootDir: templateRootDir,
      env: { AUTH_SECRET: 'test-auth-secret-at-least-32-characters' },
    });

    const result = await runtime.appConfig.reload();

    expect(result.changedNamespaces).toEqual([]);
  });
});
