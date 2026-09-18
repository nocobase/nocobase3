// @vitest-environment node

import { fileURLToPath } from 'node:url';

import { type AppIdentityConfig } from '@nocobase/app-server/config';
import { type AppDatabaseConfig } from '@nocobase/app-server/database';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import {
  type CachingConfig,
  type AppDriveConfig,
  type AppLoggingConfig,
  type AppQueueServiceConfig,
  type AppSessionConfigInput,
} from '@nocobase/app-server';
import { describe, expect, it, vi } from 'vitest';
import { Application } from '@nocobase/app-server/application';
import { QueueServiceProvider } from '@nocobase/app-server/queue';
import { createApp } from '../../server/app.js';

import appRuntime from '../../server/runtime.ts';

const templateRootDir = fileURLToPath(new URL('../..', import.meta.url));

describe('application config', () => {
  it.each(['develop', 'development', 'production', undefined])(
    'passes App environment %s directly to QueueServiceProvider',
    async (nodeEnv) => {
      const runtime = await resolveStandaloneAppRuntime(appRuntime, {
        rootDir: templateRootDir,
        env: {
          NODE_ENV: nodeEnv,
          AUTH_SECRET: 'test-auth-secret-at-least-32-characters',
        },
      });
      const addProvider = vi.spyOn(Application.prototype, 'addServiceProvider');
      try {
        createApp(runtime);
        expect(addProvider).toHaveBeenCalledWith(QueueServiceProvider, {
          nodeEnv: runtime.env.NODE_ENV,
        });
        expect(runtime.config.get('queue')).not.toHaveProperty('environment');
      } finally {
        addProvider.mockRestore();
      }
    },
  );

  it('assembles module defaults in the runtime', async () => {
    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      rootDir: templateRootDir,
      env: { AUTH_SECRET: 'test-auth-secret-at-least-32-characters' },
    });

    expect(runtime.config.get<AppIdentityConfig>('app')!.name).toBe('main');
    expect(runtime.config.get<CachingConfig>('caching')!.default).toBe(
      'memory',
    );
    expect(runtime.config.get<AppDatabaseConfig>('database')!.default).toBe(
      'main',
    );
    const drive = runtime.config.get<AppDriveConfig>('drive')!;
    expect(drive.default).toBe('local');
    expect(drive.disks.local).toEqual({
      driver: 'fs',
      location: fileURLToPath(new URL('../../storage', import.meta.url)),
      visibility: 'private',
    });
    expect(drive.disks.public).toBeUndefined();
    expect(runtime.config.get<AppLoggingConfig>('logging')!.default).toBe(
      'system',
    );
    expect(runtime.config.get<AppQueueServiceConfig>('queue')).toEqual({
      queueBackend: 'inMemory',
    });
    expect(runtime.config.get<AppSessionConfigInput>('session')!.default).toBe(
      'memory',
    );
  });

  it('reloads a file-backed configuration explicitly', async () => {
    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      rootDir: templateRootDir,
      env: { AUTH_SECRET: 'test-auth-secret-at-least-32-characters' },
    });

    const result = await runtime.config.reload();

    expect(result.changedNamespaces).toEqual([]);
  });
  it('loads only explicit env overrides and restores defaults on reload', async () => {
    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      rootDir: templateRootDir,
      env: {
        APP_SERVER_PORT: '14001',
        REDIS_HOST: 'ignored',
        NODE_ENV: 'production',
      },
    });
    expect(runtime.config.get('server.port')).toBe(14001);
    expect(runtime.config.get<AppQueueServiceConfig>('queue')).toEqual({
      queueBackend: 'inMemory',
    });
    expect(runtime.config.get('session.stores.redis.host')).toBe('127.0.0.1');
    expect(runtime.config.get('logging.pretty')).toBe(false);
    expect(runtime.config.get('session.cookie.secure')).toBe(true);
    expect(runtime.config.get('workflow.production')).toBe(true);
    delete runtime.env.APP_SERVER_PORT;
    await runtime.config.reload();
    expect(runtime.config.get('server.port')).toBe(13000);
  });
});
