import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Type } from '@sinclair/typebox';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AppConfig,
  defineAppConfig,
  defineAppConfigVariant,
} from '../src/config/index.js';
import { resolveStandaloneAppRuntime } from '../src/node/index.js';
import {
  defineServerPlugin,
  defineServerPlugins,
} from '../src/plugins/index.js';
import {
  defineAppRuntime,
  resolveAppRuntime,
  type AppRuntimeDefinition,
  type AppScope,
  type ResolvedAppRuntimeConfigContext,
} from '../src/runtime/index.js';

const featureSchema = Type.Object({ label: Type.String() });
const featureConfig = defineAppConfig<
  typeof featureSchema,
  ResolvedAppRuntimeConfigContext
>({
  namespace: 'feature',
  schema: featureSchema,
  defaults: { label: 'default' },
});

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('application runtime definition', () => {
  it('resolves scope, paths, plugins, and typed config definitions', async () => {
    const rootDir = createAppRoot();
    const runtime = await resolveAppRuntime(
      createDefinition(),
      createScope(rootDir),
    );

    expect(runtime.appConfig.get(featureConfig)).toEqual({ label: 'default' });
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
    expect(runtime.appConfig.get(featureConfig).label).toBe('default');
  });

  it('loads and reloads plugin-owned config definitions', async () => {
    let label = 'initial';
    const pluginConfig = defineAppConfig({
      namespace: 'pluginFeature',
      schema: Type.Object({ label: Type.String() }),
    });
    const plugin = defineServerPlugin({
      packageName: '@nocobase/app-plugin-service-provider-example',
      config: pluginConfig,
    });
    const runtime = await resolveAppRuntime(
      {
        ...createDefinition(),
        plugins: defineServerPlugins([plugin]),
        config: async (context) => {
          const config = new AppConfig(context.configs, { context });
          config.load({
            name: 'plugin-feature',
            read: async () => ({
              kind: 'map',
              value: { pluginFeature: { label } },
            }),
          });
          return config;
        },
      },
      createScope(createAppRoot()),
    );

    expect(runtime.appConfig.get(pluginConfig)).toEqual({ label: 'initial' });

    label = 'reloaded';
    await runtime.appConfig.reload();
    expect(runtime.appConfig.get(pluginConfig)).toEqual({ label: 'reloaded' });
  });

  it('collects plugin-owned config variants before loading', async () => {
    const providersConfig = defineAppConfig({
      namespace: 'providers',
      schema: Type.Object({
        entries: Type.Record(
          Type.String(),
          Type.Object(
            { driver: Type.String() },
            { additionalProperties: true },
          ),
        ),
      }),
      defaults: {
        entries: {
          primary: { driver: 'redis', url: 'redis://localhost:6379' },
        },
      },
    });
    const redisVariant = defineAppConfigVariant({
      target: 'providers.entries',
      discriminator: 'driver',
      value: 'redis',
      schema: Type.Object({
        driver: Type.Literal('redis'),
        url: Type.String(),
      }),
    });
    const plugin = defineServerPlugin({
      packageName: '@nocobase/app-plugin-service-provider-example',
      config: redisVariant,
    });
    const runtime = await resolveAppRuntime(
      {
        ...createDefinition(),
        plugins: defineServerPlugins([plugin]),
        config: async (context) =>
          new AppConfig([providersConfig, ...context.configs], { context }),
      },
      createScope(createAppRoot()),
    );

    expect(runtime.appConfig.get('providers.entries.primary')).toEqual({
      driver: 'redis',
      url: 'redis://localhost:6379',
    });
  });
});

function createDefinition(): AppRuntimeDefinition {
  return defineAppRuntime({
    config: async (context) => {
      const config = new AppConfig([featureConfig, ...context.configs], {
        context,
      });
      return config;
    },
    plugins: defineServerPlugins([]),
    providers: [],
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

function createAppRoot(): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'nocobase-app-runtime-'));
  tempDirs.push(rootDir);
  writeFileSync(
    path.join(rootDir, 'package.json'),
    JSON.stringify({ name: '@example/customer-app' }),
  );
  return rootDir;
}
