import { describe, expect, it, vi } from 'vitest';

import type { AppRuntime } from '../src/runtime/index.js';
import {
  Application,
  type ApplicationConfig,
} from '../src/application/index.js';
import { createConfigPaths } from '../src/config/index.js';
import { RouterProvider, routerToken } from '../src/router/index.js';
import { RealtimeProvider } from '../src/realtime/index.js';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceProviderContext,
} from '@nocobase/service-provider';

describe('application', () => {
  it('owns its router service and delegates fetch requests to it', async () => {
    const app = new Application({ runtime: createTestRuntime() });
    app.addProvider(RouterProvider);
    app.registerProviders();

    const router = app.serviceContainer.resolve(routerToken);
    router.get('/healthz', (context) => context.json({ ok: true }));

    expect(app.router).toBe(router);
    expect(app.router).not.toBe(app);
    expect(app.appName).toBe('main');
    expect(app.publicBasePath).toBe('/main');

    await app.start();
    await app.start();

    const response = await app.fetch(new Request('http://localhost/healthz'));
    await expect(response.json()).resolves.toEqual({ ok: true });

    await app.shutdown();
    await app.shutdown();
  });

  it('exposes runtime config and paths without duplicating them', () => {
    const runtime = createTestRuntime();
    const app = new Application({ runtime });

    expect(app.config).toBe(runtime.config);
    expect(app.paths).toBe(runtime.paths);
    expect(app.config).toBe(app.runtime.config);
    expect(app.paths).toBe(app.runtime.paths);
  });

  it('runs provider lifecycle phases once and shuts providers down in reverse order', async () => {
    const calls: string[] = [];
    const app = new Application({ runtime: createTestRuntime() });

    app.addProvider(TestProvider, 'first', calls);
    app.addProvider(TestProvider, 'second', calls);
    app.registerProviders();

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
    const websocketFactory = vi.fn((services) => {
      expect(services.resolve(realtimeToken)).toBe('realtime');
      return websocketHandler;
    });
    const app = new Application({
      runtime: createTestRuntime(),
      websocket: websocketFactory,
    });
    app.serviceContainer.instance(realtimeToken, 'realtime');

    expect(app.websocket).toBeDefined();
    const request = new Request('http://localhost/ws');
    const firstResult = await app.websocket?.(request);
    const secondResult = await app.websocket?.(request);

    expect(firstResult).toBeInstanceOf(Response);
    expect(secondResult).toBeInstanceOf(Response);
    expect(websocketFactory).toHaveBeenCalledExactlyOnceWith(
      app.serviceContainer,
    );
    expect(websocketHandler).toHaveBeenCalledTimes(2);
  });

  it('provides the realtime WebSocket endpoint by default', async () => {
    const app = new Application({ runtime: createTestRuntime() });
    app.addProvider(RouterProvider);
    app.addProvider(RealtimeProvider);
    app.registerProviders();

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

type TestApplicationConfig = ApplicationConfig;

class TestProvider extends ServiceProvider<AppRuntime<TestApplicationConfig>> {
  public readonly name: string;

  public constructor(
    context: ServiceProviderContext<AppRuntime<TestApplicationConfig>>,
    name: string,
    private readonly calls: string[],
  ) {
    super(context);
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

function createTestRuntime(): AppRuntime<TestApplicationConfig> {
  return {
    config: {
      app: {
        name: '/main/',
        publicBasePath: '//main//',
      },
      database: {
        client: 'pg',
        connection: 'postgres://localhost/test',
        migrations: {
          autoRun: false,
          directory: '/missing',
        },
      },
    },
    paths: createConfigPaths({ rootDir: process.cwd() }),
  };
}
