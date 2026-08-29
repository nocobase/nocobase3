import { describe, expect, it, vi } from 'vitest';
import { AppConfig, defineAppConfig } from '../src/config/index.js';
import { Type } from '@sinclair/typebox';

import {
  Application,
  type ApplicationOptions,
} from '../src/application/index.js';
import { createConfigPaths } from '../src/config/index.js';
import {
  defineApiRoutes,
  defineRootRoutes,
  routerToken,
} from '../src/router/index.js';
import { defineServerPlugin } from '../src/plugins/index.js';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

describe('application', () => {
  it('owns its router service and delegates fetch requests to it', async () => {
    const app = new Application(createTestApplicationOptions());
    await app.start();

    const router = app.container.resolve(routerToken);
    router.get('/healthz', (context) => context.json({ ok: true }));

    expect(app.router).toBe(router);
    expect(app.router).not.toBe(app);
    expect(app.appName).toBe('main');
    expect(app.publicBasePath).toBe('/main');

    await app.start();

    const response = await app.fetch(new Request('http://localhost/healthz'));
    await expect(response.json()).resolves.toEqual({ ok: true });

    await app.shutdown();
    await app.shutdown();
  });

  it('owns its resolved config and paths directly', () => {
    const options = createTestApplicationOptions();
    const app = new Application(options);

    expect(app.config).toBe(options.config);
    expect(app.paths).toBe(options.paths);
    expect(app).not.toHaveProperty('runtime');
  });

  it('starts providers before dispatching the first HTTP request', async () => {
    const calls: string[] = [];
    const app = new Application(createTestApplicationOptions());
    app.addProvider(TestProvider, 'lazy', calls);
    app.addApiRoutes(
      defineApiRoutes({
        name: 'lazy-route',
        register(router): void {
          router.get('/lazy', (context) => context.json({ ok: true }));
        },
      }),
    );

    const response = await app.fetch(new Request('http://localhost/api/lazy'));

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      'lazy:register',
      'lazy:boot',
      'lazy:start',
      'lazy:ready',
    ]);
  });

  it('initializes plugin-owned config before registering providers', async () => {
    const featureConfig = defineAppConfig({
      namespace: 'feature',
      schema: Type.Object({ enabled: Type.Boolean() }),
      defaults: { enabled: true },
    });
    const appConfig = new AppConfig([featureConfig], { context: {} });
    await appConfig.loadAll();
    const options = createTestApplicationOptions();
    const app = new Application({ ...options, config: appConfig });
    const enabledValues: boolean[] = [];

    class ConfigProvider extends ServiceProvider<Application> {
      public readonly name: string = 'config-provider';

      public override register(): void {
        enabledValues.push(this.app.config.get(featureConfig).enabled);
      }
    }

    app.addProvider(ConfigProvider);
    await app.start();

    expect(enabledValues).toEqual([true]);
  });

  it('registers API and root routes between provider boot and start', async () => {
    const calls: string[] = [];
    const app = new Application(createTestApplicationOptions());
    app.addProvider(TestProvider, 'provider', calls);
    app.addApiRoutes(
      defineApiRoutes({
        name: 'api',
        register(router): void {
          calls.push('api:register');
          router.get('/example', (context) => context.text('api'));
        },
      }),
    );
    app.addRootRoutes(
      defineRootRoutes({
        name: 'root',
        register(router): void {
          calls.push('root:register');
          router.get('/example', (context) => context.text('root'));
        },
      }),
    );

    await app.start();

    expect(calls).toEqual([
      'provider:register',
      'provider:boot',
      'api:register',
      'root:register',
      'provider:start',
      'provider:ready',
    ]);
    const apiResponse = await app.fetch(
      new Request('http://localhost/api/example'),
    );
    const rootResponse = await app.fetch(
      new Request('http://localhost/example'),
    );
    await expect(apiResponse.text()).resolves.toBe('api');
    await expect(rootResponse.text()).resolves.toBe('root');
  });

  it('registers providers and routes from resolved runtime plugins', async () => {
    const calls: string[] = [];
    const app = new Application(createTestApplicationOptions());
    const plugin = defineServerPlugin({
      packageName: '@nocobase/app-plugin-test',
      providers: [RuntimePluginProvider],
      apiRoutes: [
        defineApiRoutes({
          name: 'runtime-plugin-api',
          register(router): void {
            router.get('/runtime-plugin', (context) => context.text('api'));
          },
        }),
      ],
      rootRoutes: [
        defineRootRoutes({
          name: 'runtime-plugin-root',
          register(router): void {
            router.get('/runtime-plugin', (context) => context.text('root'));
          },
        }),
      ],
    });

    RuntimePluginProvider.calls = calls;
    app.addServerPlugins({
      appPackageName: '@nocobase/app-test',
      plugins: [
        {
          definition: plugin,
          metadata: {
            packageName: plugin.packageName,
            version: 'test',
            rootDir: '/test/plugins/runtime-plugin',
            jobLocations: [],
          },
        },
      ],
    });
    await app.start();

    expect(calls).toEqual(['register']);
    await expect(
      app
        .fetch(new Request('http://localhost/api/runtime-plugin'))
        .then((response) => response.text()),
    ).resolves.toBe('api');
    await expect(
      app
        .fetch(new Request('http://localhost/runtime-plugin'))
        .then((response) => response.text()),
    ).resolves.toBe('root');
  });

  it('registers plugin contributions before application contributions', async () => {
    const calls: string[] = [];
    const pluginServiceToken = createServiceToken<string>(
      'runtime-plugin-service',
    );
    class PluginProvider extends ServiceProvider<Application> {
      public readonly name: string = 'runtime-plugin-provider';

      public override register(): void {
        calls.push('plugin:register');
        this.app.container.instance(pluginServiceToken, 'plugin-service');
      }
    }
    class ApplicationProvider extends ServiceProvider<Application> {
      public readonly name: string = 'runtime-application-provider';

      public override register(): void {
        calls.push(this.app.container.resolve(pluginServiceToken));
      }
    }
    const plugin = defineServerPlugin({
      packageName: '@nocobase/app-plugin-runtime-order-test',
      providers: [PluginProvider],
      apiRoutes: [
        defineApiRoutes({
          name: 'runtime-plugin-api-order',
          register(router): void {
            calls.push('plugin:api');
            router.get('/runtime-order', (context) => context.text('plugin'));
          },
        }),
      ],
      rootRoutes: [
        defineRootRoutes({
          name: 'runtime-plugin-root-order',
          register(router): void {
            calls.push('plugin:root');
            router.get('/runtime-order', (context) => context.text('plugin'));
          },
        }),
      ],
    });
    const app = new Application(createTestApplicationOptions());

    app.addRuntimeContributions({
      plugins: {
        appPackageName: '@nocobase/app-test',
        plugins: [
          {
            definition: plugin,
            metadata: {
              packageName: plugin.packageName,
              version: 'test',
              rootDir: '/test/plugins/runtime-order',
              jobLocations: [],
            },
          },
        ],
      },
      providers: [ApplicationProvider],
      apiRoutes: [
        defineApiRoutes({
          name: 'runtime-application-api-order',
          register(router): void {
            calls.push('application:api');
            router.get('/runtime-order', (context) =>
              context.text('application'),
            );
          },
        }),
      ],
      rootRoutes: [
        defineRootRoutes({
          name: 'runtime-application-root-order',
          register(router): void {
            calls.push('application:root');
            router.get('/runtime-order', (context) =>
              context.text('application'),
            );
          },
        }),
      ],
    });
    await app.start();

    expect(calls).toEqual([
      'plugin:register',
      'plugin-service',
      'plugin:api',
      'application:api',
      'plugin:root',
      'application:root',
    ]);
    await expect(
      app
        .fetch(new Request('http://localhost/api/runtime-order'))
        .then((response) => response.text()),
    ).resolves.toBe('plugin');
    await expect(
      app
        .fetch(new Request('http://localhost/runtime-order'))
        .then((response) => response.text()),
    ).resolves.toBe('plugin');
  });

  it('runs provider lifecycle phases once and shuts providers down in reverse order', async () => {
    const calls: string[] = [];
    const app = new Application(createTestApplicationOptions());

    app.addProvider(TestProvider, 'first', calls);
    app.addProvider(TestProvider, 'second', calls);
    const firstStart = app.start();
    const secondStart = app.start();
    expect(secondStart).toBe(firstStart);
    await firstStart;

    const firstShutdown = app.shutdown();
    const secondShutdown = app.shutdown();
    expect(secondShutdown).toBe(firstShutdown);
    await firstShutdown;

    expect(calls).toEqual([
      'first:register',
      'second:register',
      'first:boot',
      'second:boot',
      'first:start',
      'second:start',
      'first:ready',
      'second:ready',
      'second:shutdown',
      'first:shutdown',
    ]);
  });

  it('creates one WebSocket handler from the application service container', async () => {
    const realtimeToken = createServiceToken<string>('test-realtime');
    const websocketHandler = vi.fn(() => new Response(null, { status: 204 }));
    const websocketFactory = vi.fn((container) => {
      expect(container.resolve(realtimeToken)).toBe('realtime');
      return websocketHandler;
    });
    const app = new Application({
      ...createTestApplicationOptions(),
      websocket: websocketFactory,
    });
    app.container.instance(realtimeToken, 'realtime');

    expect(app.websocket).toBeDefined();
    const request = new Request('http://localhost/ws');
    const firstResult = await app.websocket?.(request);
    const secondResult = await app.websocket?.(request);

    expect(firstResult).toBeInstanceOf(Response);
    expect(secondResult).toBeInstanceOf(Response);
    expect(websocketFactory).toHaveBeenCalledExactlyOnceWith(app.container);
    expect(websocketHandler).toHaveBeenCalledTimes(2);
  });

  it('provides the realtime WebSocket endpoint by default', async () => {
    const app = new Application(createTestApplicationOptions());
    await app.start();

    const response = await app.fetch(new Request('http://localhost/ws'));
    const events = await app.websocket(new Request('http://localhost/ws'));
    const missing = await app.websocket(
      new Request('http://localhost/missing'),
    );

    expect(response.status).toBe(426);
    expect(response.headers.get('upgrade')).toBe('websocket');
    await expect(response.json()).resolves.toEqual({
      error: 'WebSocket upgrade required',
    });
    expect(events).toMatchObject({
      onOpen: expect.any(Function),
      onMessage: expect.any(Function),
      onClose: expect.any(Function),
      onError: expect.any(Function),
    });
    expect(missing).toBeNull();

    await app.shutdown();
  });
});

class TestProvider extends ServiceProvider<Application> {
  public readonly name: string;

  public constructor(
    app: Application,
    name: string,
    private readonly calls: string[],
  ) {
    super(app);
    this.name = name;
  }

  public override register(): void {
    this.calls.push(`${this.name}:register`);
  }

  public override async boot(): Promise<void> {
    this.calls.push(`${this.name}:boot`);
  }

  public override async start(): Promise<void> {
    this.calls.push(`${this.name}:start`);
  }

  public override async ready(): Promise<void> {
    this.calls.push(`${this.name}:ready`);
  }

  public override async shutdown(): Promise<void> {
    this.calls.push(`${this.name}:shutdown`);
  }
}

class RuntimePluginProvider extends ServiceProvider<Application> {
  public readonly name: string = '@nocobase/app-plugin-test';
  public static calls: string[] = [];

  public override register(): void {
    RuntimePluginProvider.calls.push('register');
  }
}

function createTestApplicationOptions(): ApplicationOptions {
  return {
    config: new AppConfig(),
    appName: '/main/',
    publicBasePath: '//main//',
    paths: createConfigPaths({ rootDir: '/test/app' }),
  };
}
