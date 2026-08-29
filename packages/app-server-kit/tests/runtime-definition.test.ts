import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveStandaloneAppRuntime } from '../src/node/index.js';
import { defineServerPlugins } from '../src/plugins/index.js';
import {
  defineAppRuntime,
  resolveAppRuntime,
  resolveAppRuntimeConfigSection,
  type AppRuntimeConfig,
  type AppRuntimeDefinition,
  type AppScope,
} from '../src/runtime/index.js';

interface TestScopeConfig {
  readonly label?: string;
}

interface TestConfig extends AppRuntimeConfig {
  readonly app: {
    readonly name: string;
    readonly publicBasePath: string;
  };
  readonly feature: {
    readonly label: string;
  };
  readonly expensive: {
    readonly loaded: boolean;
  };
}

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('application runtime definition', () => {
  it('resolves routing, structured scope config, paths, and plugins before config factories', () => {
    const rootDir = createAppRoot();
    const definition = createDefinition();
    const runtime = resolveAppRuntime(
      definition,
      createScope(rootDir, { label: 'embedded' }),
    );

    expect(runtime.config).toEqual({
      app: {
        name: 'customer',
        publicBasePath: '/customers',
      },
      feature: { label: 'embedded' },
      expensive: { loaded: true },
      plugins: [],
    });
    expect(runtime.configPaths.root()).toBe(rootDir);
    expect(runtime.plugins.appPackageName).toBe('@example/customer-app');
    expect(runtime.providers).toEqual([]);
    expect(runtime.apiRoutes).toEqual([]);
    expect(runtime.rootRoutes).toEqual([]);
  });

  it('creates and resolves standalone scopes from core defaults', () => {
    const rootDir = createAppRoot();
    const runtime = resolveStandaloneAppRuntime(createDefinition(), {
      rootDir,
      config: { label: 'standalone' },
    });

    expect(runtime.mode).toBe('standalone');
    expect(runtime.routing).toMatchObject({
      name: 'main',
      publicBasePath: '/main',
    });
    expect(runtime.config.feature.label).toBe('standalone');
  });

  it('resolves one config section without evaluating unrelated sections', () => {
    const rootDir = createAppRoot();
    const expensive = vi.fn(() => {
      throw new Error('unrelated config was evaluated');
    });
    const definition = createDefinition(expensive);

    const resolved = resolveAppRuntimeConfigSection(
      definition,
      createScope(rootDir, { label: 'database-task' }),
      'feature',
    );

    expect(resolved.config).toEqual({ label: 'database-task' });
    expect(expensive).not.toHaveBeenCalled();
    expect(resolved.plugins.plugins).toEqual([]);
  });
});

function createDefinition(
  expensive: () => TestConfig['expensive'] = () => ({ loaded: true }),
): AppRuntimeDefinition<TestConfig, TestScopeConfig> {
  return defineAppRuntime<TestConfig, TestScopeConfig>({
    config: {
      app: ({ routing }) => ({
        name: routing?.name ?? 'app',
        publicBasePath: routing?.publicBasePath ?? '/',
      }),
      feature: ({ scopeConfig }) => ({
        label: scopeConfig?.label ?? 'default',
      }),
      expensive,
    },
    plugins: defineServerPlugins<TestConfig>([]),
    providers: [],
    apiRoutes: [],
    rootRoutes: [],
  });
}

function createScope(
  rootDir: string,
  config?: TestScopeConfig,
): AppScope<TestScopeConfig> {
  return {
    id: 'customer',
    appName: 'customer',
    basePath: '/customers',
    paths: {
      rootDir,
      serverDir: path.join(rootDir, 'server'),
    },
    config,
    registerDisposer(): void {},
  };
}

function createAppRoot(): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'nocobase-app-runtime-'));
  tempDirs.push(rootDir);
  writeFileSync(
    path.join(rootDir, 'package.json'),
    JSON.stringify({ name: '@example/customer-app' }),
  );
  return rootDir;
}
