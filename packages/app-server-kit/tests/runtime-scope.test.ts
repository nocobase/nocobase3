import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createAppConfigPaths,
  resolveAppRouting,
  resolveAppScopeEnv,
  resolveAppScopePaths,
  resolveAppScopeRuntime,
  type AppPathOptions,
  type AppScope,
} from '../src/runtime/index.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('application scope paths', () => {
  it('uses host-resolved paths without applying layout assumptions', () => {
    const paths: AppPathOptions = {
      rootDir: '/srv/apps/main',
      serverDir: '/srv/releases/main/server',
      databaseDir: '/srv/releases/main/database',
      clientDir: '/srv/releases/main/client',
      storageDir: '/data/apps/main',
    };

    expect(resolveAppScopePaths(createScope({ paths }))).toEqual(paths);
  });

  it('adapts legacy granular host paths to the standard dist layout', () => {
    const rootDir = path.resolve('/srv/apps/main');

    expect(
      resolveAppScopePaths(
        createScope({
          rootDir,
          clientDir: '/srv/client/main',
          dataDir: '/data/apps/main',
        }),
      ),
    ).toEqual({
      rootDir,
      serverDir: path.join(rootDir, 'dist/server'),
      databaseDir: path.join(rootDir, 'dist/database'),
      clientDir: '/srv/client/main',
      storageDir: '/data/apps/main',
    });
  });

  it('requires either resolved paths or a legacy root directory', () => {
    expect(() => resolveAppScopePaths(createScope())).toThrow(
      'Application scopes require scope.rootDir or scope.paths.',
    );
  });

  it('creates config path accessors from resolved scope paths', () => {
    const paths = createAppConfigPaths({
      rootDir: '/srv/apps/main',
      serverDir: '/srv/releases/main/server',
      databaseDir: '/srv/releases/main/database',
      storageDir: '/data/apps/main',
    });

    expect(paths.root('.env')).toBe('/srv/apps/main/.env');
    expect(paths.server('config')).toBe('/srv/releases/main/server/config');
    expect(paths.database('migrations')).toBe(
      '/srv/releases/main/database/migrations',
    );
    expect(paths.storage('uploads')).toBe('/data/apps/main/uploads');
  });
});

describe('application scope environment', () => {
  it('loads root environment files when the host does not supply an env map', () => {
    const rootDir = createTempDirectory();
    writeFileSync(
      path.join(rootDir, '.env'),
      'APP_NAME=base\nSHARED_VALUE=base\n',
    );
    writeFileSync(
      path.join(rootDir, '.env.local'),
      'SHARED_VALUE=local\nLOCAL_ONLY=yes\n',
    );
    const scope = createScope({ rootDir });
    const paths = resolveAppScopePaths(scope);

    expect(resolveAppScopeEnv(scope, paths)).toMatchObject({
      APP_NAME: 'base',
      SHARED_VALUE: 'local',
      LOCAL_ONLY: 'yes',
    });
  });

  it('prefers a host env map and applies explicit resolver overrides last', () => {
    const scope = createScope({
      rootDir: '/srv/apps/main',
      env: {
        APP_NAME: 'host',
        SHARED_VALUE: 'host',
      },
    });
    const paths = resolveAppScopePaths(scope);

    expect(
      resolveAppScopeEnv(scope, paths, {
        SHARED_VALUE: 'override',
        CONFIG_ONLY: 'mapped',
      }),
    ).toEqual({
      APP_NAME: 'host',
      SHARED_VALUE: 'override',
      CONFIG_ONLY: 'mapped',
    });
  });
});

describe('application routing', () => {
  it('normalizes routing and derives the public API URL', () => {
    expect(
      resolveAppRouting({
        name: '/main/',
        publicBasePath: '//group/main//',
        internalBasePath: '/',
      }),
    ).toEqual({
      name: 'main',
      publicBasePath: '/group/main',
      internalBasePath: '',
    });
  });

  it('resolves identity, paths, environment, mode, and routing together', () => {
    const paths: AppPathOptions = {
      rootDir: '/srv/apps/main',
      serverDir: '/srv/apps/main/server',
    };

    expect(
      resolveAppScopeRuntime(
        createScope({
          mode: 'standalone',
          appName: 'customer-portal',
          basePath: '/customers',
          env: { FROM_HOST: 'yes' },
          paths,
        }),
        {
          envOverrides: { FROM_CONFIG: 'yes' },
          routing: {
            internalBasePath: '',
          },
        },
      ),
    ).toEqual({
      mode: 'standalone',
      env: {
        FROM_HOST: 'yes',
        FROM_CONFIG: 'yes',
      },
      paths,
      routing: {
        name: 'customer-portal',
        publicBasePath: '/customers',
        internalBasePath: '',
      },
    });
  });
});

function createScope(values: Partial<AppScope> = {}): AppScope {
  return {
    id: 'main',
    basePath: '/main',
    registerDisposer(): void {},
    ...values,
  };
}

function createTempDirectory(): string {
  const directory = mkdtempSync(
    path.join(tmpdir(), 'nocobase-app-scope-runtime-'),
  );
  tempDirs.push(directory);
  return directory;
}
