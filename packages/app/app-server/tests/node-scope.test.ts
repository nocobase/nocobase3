import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createStandaloneScope,
  loadStandaloneAppEnv,
  resolveStandaloneAppPaths,
  StandaloneAppScope,
} from '../src/node/index.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('standalone app environment', () => {
  it('merges the process environment and explicit overrides', () => {
    expect(
      loadStandaloneAppEnv({
        rootDir: '/app',
        baseEnv: {
          PROCESS_ONLY: 'yes',
          SHARED_VALUE: 'process',
        },
        overrides: {
          OVERRIDE_ONLY: 'yes',
          SHARED_VALUE: 'override',
        },
      }),
    ).toEqual({
      PROCESS_ONLY: 'yes',
      OVERRIDE_ONLY: 'yes',
      SHARED_VALUE: 'override',
    });
  });

  it('loads dotenv files below process environment and explicit overrides', () => {
    const rootDir = createTempDirectory();
    writeFileSync(
      path.join(rootDir, '.env'),
      'DOTENV_ONLY=yes\nSHARED_VALUE=dotenv\nEXPANDED=$BASE_VALUE/suffix\n',
    );
    writeFileSync(
      path.join(rootDir, '.env.local'),
      'LOCAL_ONLY=yes\nSHARED_VALUE=local\n',
    );

    expect(
      loadStandaloneAppEnv({
        rootDir,
        baseEnv: {
          BASE_VALUE: 'base',
          PROCESS_ONLY: 'yes',
          SHARED_VALUE: 'process',
        },
        overrides: {
          OVERRIDE_ONLY: 'yes',
          SHARED_VALUE: 'override',
        },
      }),
    ).toEqual({
      BASE_VALUE: 'base',
      DOTENV_ONLY: 'yes',
      EXPANDED: 'base/suffix',
      LOCAL_ONLY: 'yes',
      PROCESS_ONLY: 'yes',
      OVERRIDE_ONLY: 'yes',
      SHARED_VALUE: 'override',
    });
  });
});

describe('standalone app scope', () => {
  it('resolves source and built application layouts', () => {
    expect(resolveStandaloneAppPaths({ rootDir: '/srv/apps/main' })).toEqual({
      rootDir: '/srv/apps/main',
      serverDir: '/srv/apps/main/server',
      databaseDir: '/srv/apps/main/database',
      clientDir: '/srv/apps/main/dist/client',
      storageDir: '/srv/apps/main/storage',
    });
    expect(
      resolveStandaloneAppPaths({ rootDir: '/srv/apps/main/dist' }),
    ).toEqual({
      rootDir: '/srv/apps/main/dist',
      serverDir: '/srv/apps/main/dist/server',
      databaseDir: '/srv/apps/main/dist/database',
      clientDir: '/srv/apps/main/dist/client',
      storageDir: '/srv/apps/main/dist/storage',
    });
  });

  it('prefers explicit application paths over the root directory convention', () => {
    const paths = {
      rootDir: '/custom/root',
      serverDir: '/custom/server',
      databaseDir: '/custom/database',
      clientDir: '/custom/client',
      storageDir: '/custom/storage',
    };

    expect(resolveStandaloneAppPaths({ rootDir: '/ignored/root', paths })).toBe(
      paths,
    );
  });

  it('requires the caller to locate the standalone application', () => {
    expect(() => resolveStandaloneAppPaths({})).toThrow(
      'Standalone scope requires options.rootDir or options.paths.',
    );
  });

  it('creates a standalone scope from core defaults and overrides', () => {
    const rootDir = createTempDirectory();
    const scope = createStandaloneScope({
      rootDir,
      env: { FROM_ENV: 'yes', FROM_OVERRIDE: 'yes' },
    });

    expect(scope.appName).toBe('main');
    expect(scope.basePath).toBe('/main');
    expect(scope.env).toMatchObject({
      FROM_ENV: 'yes',
      FROM_OVERRIDE: 'yes',
    });
  });

  it('derives the application name from the resolved base path', () => {
    const rootDir = createTempDirectory();

    const fromEnvironment = createStandaloneScope({
      rootDir,
      env: { APP_BASE_PATH: '/sales' },
    });
    const fromOptions = createStandaloneScope({
      rootDir,
      appName: 'custom',
      basePath: '/operations',
    });

    expect(fromEnvironment.appName).toBe('sales');
    expect(fromEnvironment.basePath).toBe('/sales');
    expect(fromOptions.appName).toBe('custom');
    expect(fromOptions.basePath).toBe('/operations');
  });

  it('owns identity, environment, paths, and lifecycle', async () => {
    const paths = {
      rootDir: '/srv/apps/main',
      serverDir: '/srv/apps/main/server',
      clientDir: '/srv/apps/main/client',
      storageDir: '/data/apps/main',
    };
    const scope = new StandaloneAppScope({
      appName: 'main',
      basePath: '/main',
      paths,
      env: { APP_NAME: 'main' },
    });

    expect(scope).toMatchObject({
      mode: 'standalone',
      id: 'main',
      appName: 'main',
      basePath: '/main',
      paths,
      rootDir: '/srv/apps/main',
      dataDir: '/data/apps/main',
      clientDir: '/srv/apps/main/client',
      env: { APP_NAME: 'main' },
    });
    expect(scope.signal.aborted).toBe(false);

    await scope.destroy();

    expect(scope.signal.aborted).toBe(true);
  });
});

function createTempDirectory(): string {
  const directory = mkdtempSync(
    path.join(tmpdir(), 'nocobase-standalone-app-env-'),
  );
  tempDirs.push(directory);
  return directory;
}
