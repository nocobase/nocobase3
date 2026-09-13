import { Application } from '../src/application/index.js';
import type { AppRuntimeContext } from '../src/runtime/definition.js';
import { defaultAppConfigs } from '../src/config/index.js';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppConfig, defineAppConfig } from '../src/config/index.js';
import { resolveStandaloneAppRuntime } from '../src/node/index.js';
import { defineServerPlugins } from '../src/plugins/index.js';
import {
  defineAppRuntime,
  resolveAppRuntime,
  type AppRuntimeDefinition,
  type AppScope,
} from '../src/runtime/index.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('application runtime definition', () => {
  it('assembles configuration before application creation and preserves it on reload', async () => {
    let deploymentLabel: string | undefined = 'deployment';
    const callback = vi.fn();
    const configure = vi.fn((context: AppRuntimeContext) => ({
      label: 'code',
      callback: () => callback(context.app),
    }));
    const definition = createDefinition();
    const runtime = await resolveAppRuntime(
      {
        ...definition,
        createAppConfig: (context) => {
          const config = definition.createAppConfig(context);
          config.load({
            name: 'environment',
            read: async () => ({
              kind: 'map',
              value: deploymentLabel
                ? { feature: { label: deploymentLabel } }
                : {},
            }),
          });
          return config;
        },
        defaultConfigs: defaultAppConfigs({
          feature: defineAppConfig(configure),
        }),
      },
      createScope(createAppRoot()),
    );
    expect(runtime.app).toBeUndefined();
    const app = new Application({
      config: runtime.config,
      paths: runtime.configPaths,
    });
    runtime.app = app;
    expect(app.config).toBe(runtime.config);
    expect(runtime.config.get('feature.label')).toBe('deployment');
    const action = runtime.config.get<() => void>('feature.callback')!;
    action();
    expect(callback).toHaveBeenCalledWith(runtime.app);
    deploymentLabel = undefined;
    await runtime.config.reload();
    expect(runtime.config.get('feature.label')).toBe('code');
    expect(runtime.config.get('feature.callback')).toBe(action);
    expect(configure).toHaveBeenCalledOnce();
  });

  it('resolves scope, paths, plugins, and typed config definitions', async () => {
    const rootDir = createAppRoot();
    const runtime = await resolveAppRuntime(
      createDefinition(),
      createScope(rootDir),
    );

    expect(runtime.config.get('feature')).toEqual({ label: 'default' });
    expect(runtime.configPaths.root()).toBe(rootDir);
    expect(runtime.plugins.appPackageName).toBe('@example/customer-app');
  });

  it('creates standalone scopes from core defaults', async () => {
    const runtime = await resolveStandaloneAppRuntime(createDefinition(), {
      rootDir: createAppRoot(),
    });

    expect(runtime.mode).toBe('standalone');
    expect(runtime.routing).toMatchObject({
      name: 'main',
      publicBasePath: '/main',
    });
    expect(runtime.config.get<{ label: string }>('feature')!.label).toBe(
      'default',
    );
  });
});

function createDefinition(): AppRuntimeDefinition {
  return defineAppRuntime({
    createAppConfig: () => new AppConfig(),
    defaultConfigs: defaultAppConfigs({
      feature: defineAppConfig(() => ({ label: 'default' })),
    }),
    plugins: defineServerPlugins([]),
    serviceProviders: [],
    routes: [],
  });
}

function createScope(rootDir: string): AppScope {
  return {
    id: 'customer',
    appName: 'customer',
    basePath: '/customers',
    paths: { rootDir, serverDir: path.join(rootDir, 'server') },
    registerDisposer(): void {},
  };
}

const PLUGIN_PACKAGE = '@nocobase/app-plugin-service-provider-example';

function createAppRoot(): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'nocobase-app-runtime-'));
  tempDirs.push(rootDir);
  writeFileSync(
    path.join(rootDir, 'package.json'),
    JSON.stringify({ name: '@example/customer-app' }),
  );

  // The plugin has to be resolvable from the application root, which is what `resolveAppServerPlugins` looks up. A
  // temporary directory has no `node_modules` of its own and inherits none, so the one plugin these tests configure
  // is linked in explicitly.
  const scopeDir = path.join(rootDir, 'node_modules', '@nocobase');
  mkdirSync(scopeDir, { recursive: true });
  symlinkSync(
    path.resolve(
      import.meta.dirname,
      '../../../examples/app-plugin-service-provider-example',
    ),
    path.join(scopeDir, PLUGIN_PACKAGE.replace('@nocobase/', '')),
    'dir',
  );

  return rootDir;
}
