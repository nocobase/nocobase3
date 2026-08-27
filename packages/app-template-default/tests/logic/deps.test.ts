// @vitest-environment node

import type { DatabaseManager } from '@nocobase/app-database';
import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import { createConfigPaths } from '@nocobase/app-server-kit/config';
import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../../server/config/index.ts';
import { createAppDeps } from '../../server/runtime/deps.ts';
import { createPortalSpaRuntimeGlobals } from '../../server/spa/runtime-globals.ts';

vi.mock('@nocobase/caching', () => ({
  createCaching: () => ({ dispose: () => Promise.resolve() }),
}));

vi.mock('@nocobase/app-plugin-authentication', () => ({
  createAuthStorage: () => ({}),
  createAuthentication: () => ({
    handler: () => Promise.resolve(new Response()),
  }),
}));

vi.mock('@nocobase/app-plugin-authorization', () => ({
  createAppAuthorization: () => ({}),
}));

vi.mock('@nocobase/drive', () => ({
  createDriveManager: () => ({}),
}));

vi.mock('@nocobase/id-generator', () => ({
  SnowflakeIdGenerator: class {
    generateString(): string {
      return 'test-id';
    }
  },
}));

vi.mock('@nocobase/logging', () => ({
  createLogging: () => ({
    getLogger: () => ({ child: () => ({}) }),
    flush: () => Promise.resolve(),
  }),
}));

vi.mock('@nocobase/queue', () => ({
  createQueueManager: () => ({ close: () => Promise.resolve() }),
  createSyncQueueConfig: () => ({}),
}));

vi.mock('@nocobase/session', () => ({
  createNullSessionConfig: () => ({}),
  createSessionManager: () => ({ dispose: () => Promise.resolve() }),
}));

describe('app dependencies', () => {
  it('returns the exact runtime database instance when present', () => {
    const database = {} as DatabaseManager;

    expect(createAppDeps(createRuntime(database)).database).toBe(database);
  });

  it('preserves an absent runtime database as undefined', () => {
    expect(createAppDeps(createRuntime()).database).toBeUndefined();
  });

  it('does not expose the database through browser runtime globals', () => {
    const globals = createPortalSpaRuntimeGlobals({
      appBasePath: '/main',
      apiUrl: '/main/v2/api',
    });

    expect(globals).not.toHaveProperty('database');
    expect(globals).not.toHaveProperty('NOCOBASE_DATABASE');
  });
});

function createRuntime(database?: DatabaseManager): AppRuntime<AppConfig> {
  return {
    config: {
      app: {
        name: 'main',
        publicOrigin: undefined,
        publicBasePath: '/main',
        internalBasePath: '',
        internalApiProxyPath: '/v2/api',
        publicApiUrl: '/main/v2/api',
        nocoBaseApiUrl: undefined,
      },
      plugins: [],
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      caching: { default: 'memory', providers: {} },
      database: {
        default: 'main',
        connections: {},
        migrations: { directory: '', autoRun: false },
      },
      drive: { default: 'local', disks: {}, links: {} },
      logging: { default: 'system', loggers: {} },
      queue: { default: 'sync', connections: {} },
      session: { enabled: false },
      server: {
        host: '127.0.0.1',
        port: 0,
        startLog: false,
        viteDevUrl: undefined,
      },
      spa: {
        indexPath: '/tmp/index.html',
        runtime: {
          storagePrefix: 'NOCOBASE_',
          storageType: 'localStorage',
          shareToken: false,
        },
      },
    } as AppConfig,
    paths: createConfigPaths({ rootDir: '/tmp/app-template-default' }),
    database,
    runMigrations: () => Promise.resolve(undefined),
    runSeeds: () => Promise.resolve(undefined),
    dispose: () => Promise.resolve(),
  };
}
