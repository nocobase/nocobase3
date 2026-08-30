// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { CachingProvider, createDefaultCachingConfig } from '@nocobase/caching';
import {
  createConfigPaths,
  readEnvFiles,
} from '@nocobase/app-server-kit/config';
import { startNodeAppServer } from '@nocobase/app-server-kit/node';
import {
  createRealtimeService,
  realtimeServiceToken,
  type RealtimeServerMessage,
} from '@nocobase/app-server-kit/realtime';
import { healthCheckApiRoutes } from '@nocobase/app-server-kit/router';
import {
  createServiceToken,
  ServiceContainer,
  ServiceProvider,
  ServiceProviderRegistry,
} from '@nocobase/service-provider';
import type {
  AppWebSocket,
  AppWebSocketReadyState,
} from '@nocobase/app-server-kit/websocket';
import {
  databaseManagerToken,
  type DatabaseManager,
  type QueryAdapter,
} from '@nocobase/app-database';
import { DriveProvider } from '@nocobase/drive';
import { IdGeneratorProvider } from '@nocobase/id-generator';
import {
  createSilentLoggingConfig,
  LoggingProvider,
  requestLoggingMiddleware,
} from '@nocobase/logging';
import {
  createSyncQueueConfig,
  QueueProvider,
  type AppQueueConfig,
} from '@nocobase/queue';
import {
  createNocoBaseSpaRuntimeGlobals,
  spaRootRoutes,
} from '@nocobase/app-server-kit/spa';
import {
  createNullSessionConfig,
  sessionHttpMiddleware,
  SessionProvider,
} from '@nocobase/session';
import {
  joinBasePath,
  normalizeBasePath,
  resolveAppNameFromBasePath,
} from '@nocobase/app-server-kit/support';
import {
  createAppDisposerRegistry,
  createPublicBasePathAdapter,
  resolveAppRuntime,
  type AppDisposer,
  type AppScope,
} from '@nocobase/app-server-kit/runtime';
import { Application } from '@nocobase/app-server-kit/application';
import {
  defineServerPlugin,
  defineServerPlugins,
  type AppServerPlugin,
  type ResolvedAppServerPlugins,
} from '@nocobase/app-server-kit/plugins';
import authenticationServerPlugin from '@nocobase/app-plugin-authentication/server/plugin';
import authorizationServerPlugin from '@nocobase/app-plugin-authorization/server/plugin';

import { createApp } from '../../server/app.ts';
import { createServer as createEmbeddedServer } from '../../server/embedded.ts';
import { createStandaloneRuntimeScope } from '@nocobase/app-server-kit/node';
import appRuntime from '../../server/runtime.ts';
import {
  createStandaloneServer,
  type StandaloneServer,
  type StandaloneServerOptions,
} from '../../server/standalone.ts';
import type { AppConfig } from '../../server/config/index.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

interface CloseableResource {
  close(): Promise<void>;
}

interface FetchableResource {
  readonly fetch: (request: Request) => Response | Promise<Response>;
}

type TestApp = Application<AppConfig> & CloseableResource;

interface RegisteredTestDisposer {
  name: string;
  dispose: AppDisposer;
}

const apps: CloseableResource[] = [];
const servers: Server[] = [];
const tempDirs: string[] = [];
const TEST_REALTIME_TOPIC = 'test:realtime';
const require = createRequire(import.meta.url);

function declaredPluginVersion(packageName: string): string {
  return (
    require(`${packageName}/package.json`) as { readonly version: string }
  ).version;
}

function requestApp(
  app: FetchableResource,
  input: Request | string | URL,
  requestInit?: RequestInit,
): Response | Promise<Response> {
  const request =
    input instanceof Request ? input : new Request(input, requestInit);
  return app.fetch(request);
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(apps.splice(0).map((app) => app.close()));

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }

  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        }),
    ),
  );
});

describe('app server', () => {
  it('represents the NocoBase application separately from its Hono router', () => {
    const app = createTestApp({
      publicBasePath: '/app-template-default',
    });

    expect(app).toBeInstanceOf(Application);
    expect(app.router).not.toBe(app);
    expect(app.container).toBeDefined();
    expect(app.appName).toBe('app-template-default');
    expect(app.publicBasePath).toBe('/app-template-default');
    expect(app.config.app.publicBasePath).toBe('/app-template-default');
  });

  it('passes the application to plugin providers', () => {
    let providerApplication: unknown;
    class TestPluginProvider extends ServiceProvider {
      public readonly name: string = '@nocobase/app-plugin-test';

      public override register(): void {
        providerApplication = this.app;
      }
    }

    const app = createTestApp({
      plugins: [
        defineServerPlugin<AppConfig>({
          packageName: '@nocobase/app-plugin-test',
          providers: [TestPluginProvider],
        }),
      ],
    });

    expect(providerApplication).toBe(app);
    expect(app.container).toBeInstanceOf(ServiceContainer);
    expect(app.container.resolve(realtimeServiceToken)).toBeDefined();
  });

  it('registers plugin API routes through the dedicated API router', async () => {
    const app = createTestApp({
      plugins: [
        defineServerPlugin<AppConfig>({
          packageName: '@nocobase/app-plugin-test',
          routes: [
            {
              scope: 'api',
              createRouter(application): Hono {
                const router = new Hono();
                router.get('/plugin-test', (context) =>
                  context.json({ appName: application.appName }),
                );
                return router;
              },
            },
          ],
        }),
      ],
    });

    await app.start();

    const response = await requestApp(app, 'http://localhost/api/plugin-test');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ appName: app.appName });
  });

  it('starts service providers only through the asynchronous runtime path', async () => {
    const boot = vi.spyOn(ServiceProviderRegistry.prototype, 'bootAll');
    const start = vi.spyOn(ServiceProviderRegistry.prototype, 'startAll');
    const ready = vi.spyOn(ServiceProviderRegistry.prototype, 'readyAll');

    try {
      createTestApp({
        publicBasePath: '/low-level-app',
      });

      expect(boot).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
      expect(ready).not.toHaveBeenCalled();

      await createEmbeddedServer(
        createEmbeddedTestScope({
          id: 'provider-lifecycle-app',
          basePath: '/provider-lifecycle-app',
        }),
      );

      expect(boot).toHaveBeenCalledOnce();
      expect(start).toHaveBeenCalledOnce();
      expect(ready).toHaveBeenCalledOnce();
      expect(boot.mock.invocationCallOrder[0]).toBeLessThan(
        start.mock.invocationCallOrder[0],
      );
      expect(start.mock.invocationCallOrder[0]).toBeLessThan(
        ready.mock.invocationCallOrder[0],
      );
    } finally {
      boot.mockRestore();
      start.mockRestore();
      ready.mockRestore();
    }
  });

  it('starts without optional plugins or workflow routes', async () => {
    const app = createTestApp();

    expect(
      app.router.routes.some((route) => route.path.includes('/workflows')),
    ).toBe(false);
  });

  it('creates embedded apps from a scope', async () => {
    const app = await createEmbeddedServer(
      createEmbeddedTestScope({
        id: 'app-template-default',
        basePath: '/embedded-app-template-default',
      }),
    );

    const response = await requestApp(app, 'http://localhost/api/healthz');
    const websocketEvents = await app.websocket?.(
      new Request('http://localhost/ws'),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      app: {
        name: 'app-template-default',
        basePath: '/embedded-app-template-default',
      },
      basePath: '/embedded-app-template-default',
    });
    expect(websocketEvents).toMatchObject({
      onMessage: expect.any(Function),
    });
  });

  it('registers application-owned providers and routes from the runtime', async () => {
    const pluginServiceToken = createServiceToken<string>(
      '@nocobase/app-template-default/tests/plugin-service',
    );
    const providerCalls: string[] = [];
    class TestRuntimePluginProvider extends ServiceProvider<
      Application<AppConfig>
    > {
      public readonly name: string = '@nocobase/app-plugin-runtime-test';

      public override register(): void {
        providerCalls.push('plugin');
        this.app.container.instance(pluginServiceToken, 'plugin service');
      }
    }
    class TestRuntimeApplicationProvider extends ServiceProvider<
      Application<AppConfig>
    > {
      public readonly name: string =
        '@nocobase/app-template-default/runtime-test';

      public override register(): void {
        providerCalls.push(this.app.container.resolve(pluginServiceToken));
      }
    }
    const scope = createEmbeddedTestScope({
      id: 'app-template-default',
      basePath: '/embedded-app-template-default',
    });
    const resolvedRuntime = resolveAppRuntime(
      {
        ...appRuntime,
        plugins: defineServerPlugins<AppConfig>([]),
        providers: [...appRuntime.providers, TestRuntimeApplicationProvider],
      },
      scope,
    );
    const runtime = {
      ...resolvedRuntime,
      plugins: createResolvedTestServerPlugins([
        defineServerPlugin<AppConfig>({
          packageName: '@nocobase/app-plugin-runtime-test',
          providers: [TestRuntimePluginProvider],
        }),
      ]),
    };
    const application = createApp(runtime);
    const app = trackCloseable(
      Object.assign(application, {
        close(): Promise<void> {
          return application.shutdown();
        },
      }),
    );
    await app.start();

    expect(providerCalls).toEqual(['plugin', 'plugin service']);
    const apiResponse = await requestApp(app, 'http://localhost/api/example');
    const rootResponse = await requestApp(app, 'http://localhost/example');

    expect(apiResponse.status).toBe(200);
    await expect(apiResponse.json()).resolves.toEqual({
      scope: 'api',
      message: 'Hello from the application provider',
    });
    expect(rootResponse.status).toBe(200);
    expect(rootResponse.headers.get('content-type')).toContain('text/html');
    const rootHtml = await rootResponse.text();
    expect(rootHtml).toContain('<h1>Application Route Example</h1>');
    expect(rootHtml).toContain('Hello from the application provider');
  });

  it('does not leak plugin authentication into application-owned API routes', async () => {
    const app = await createEmbeddedServer(
      createEmbeddedTestScope({
        id: 'app-template-default',
        basePath: '/embedded-app-template-default',
      }),
    );

    const apiResponse = await requestApp(app, 'http://localhost/api/example');

    expect(apiResponse.status).toBe(200);
    await expect(apiResponse.json()).resolves.toEqual({
      scope: 'api',
      message: 'Hello from the application provider',
    });
  });

  it('routes authentication requests through the configured public auth URL', async () => {
    const app = createTestApp({
      publicOrigin: 'http://localhost',
      publicBasePath: '/main',
    });
    const mounted = createPublicBasePathAdapter(app, '/main');

    const response = await requestApp(
      mounted,
      'http://localhost/main/api/auth/sign-in/username',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'missing-user',
          password: 'not-the-password',
        }),
      },
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      code: 'INVALID_USERNAME',
      message: 'Username is invalid',
    });
  });

  it('exposes an app-local WebSocket handler outside the API namespace', async () => {
    const app = createTestApp({
      publicBasePath: '/app-template-default',
    });

    const response = await requestApp(app, 'http://localhost/ws');
    const websocketEvents = await app.websocket?.(
      new Request('http://localhost/ws'),
    );
    const missingEvents = await app.websocket?.(
      new Request('http://localhost/missing-ws'),
    );

    expect(response.status).toBe(426);
    expect(response.headers.get('upgrade')).toBe('websocket');
    await expect(response.json()).resolves.toEqual({
      error: 'WebSocket upgrade required',
    });
    expect(websocketEvents).toMatchObject({
      onMessage: expect.any(Function),
    });
    expect(missingEvents).toBeNull();
  });

  it('subscribes, publishes, and unsubscribes realtime messages', () => {
    const realtime = createRealtimeService();
    const websocket = createTestWebSocket();
    const connection = realtime.connect(websocket);

    realtime.handleClientMessage(
      connection,
      JSON.stringify({
        type: 'subscribe',
        id: 'subscribe-test-topic',
        topic: TEST_REALTIME_TOPIC,
      }),
    );
    const subscribed = websocket.messages[0];

    expect(subscribed).toMatchObject({
      type: 'subscribed',
      id: 'subscribe-test-topic',
      topic: TEST_REALTIME_TOPIC,
      subscriptionId: expect.any(String),
    });

    realtime.publish(TEST_REALTIME_TOPIC, 'tick');

    expect(websocket.messages[1]).toMatchObject({
      type: 'event',
      topic: TEST_REALTIME_TOPIC,
      payload: 'tick',
      publishedAt: expect.any(String),
    });

    realtime.handleClientMessage(
      connection,
      JSON.stringify({
        type: 'unsubscribe',
        id: 'unsubscribe-test-topic',
        subscriptionId: (subscribed as { subscriptionId: string })
          .subscriptionId,
      }),
    );
    realtime.publish(TEST_REALTIME_TOPIC, 'after unsubscribe');

    expect(websocket.messages[2]).toMatchObject({
      type: 'unsubscribed',
      id: 'unsubscribe-test-topic',
      subscriptionId: (subscribed as { subscriptionId: string }).subscriptionId,
      topic: TEST_REALTIME_TOPIC,
    });
    expect(websocket.messages).toHaveLength(3);

    realtime.close();
  });

  it('registers embedded app resources with the scope', async () => {
    const registeredDisposers: RegisteredTestDisposer[] = [];
    const app = await createEmbeddedServer(
      createEmbeddedTestScope(
        {
          id: 'app-template-default',
          basePath: '/embedded-app-template-default',
        },
        registeredDisposers,
      ),
    );

    expect(typeof (app as { close?: unknown }).close).toBe('undefined');
    expect(registeredDisposers.map((disposer) => disposer.name)).toEqual([
      'application',
    ]);

    for (const disposer of [...registeredDisposers].reverse()) {
      await expect(disposer.dispose()).resolves.toBeUndefined();
      await expect(disposer.dispose()).resolves.toBeUndefined();
    }
  });

  it('serves embedded production SPA routes from the stripped app-host path', async () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-template-default-embedded-client-'),
    );
    tempDirs.push(root);
    writeFileSync(
      path.join(root, 'index.html'),
      '<div id="root"></div><script type="module" src="/app-template-default/assets/index.js"></script>',
    );

    const app = await createEmbeddedServer(
      createEmbeddedTestScope({
        id: 'app-template-default',
        basePath: '/app-template-default',
        config: { authSecret: 'test-auth-secret-at-least-32-characters' },
        clientDir: root,
      }),
    );

    const response = await requestApp(app, 'http://localhost/');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      'window.NOCOBASE_PORTAL_BASE = "/app-template-default/";',
    );
    expect(html).toContain(
      'window.NOCOBASE_API_URL = "/app-template-default/api";',
    );
  });

  it('reads embedded runtime config from the application root without using process.env', async () => {
    const appRoot = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-template-default-embedded-root-'),
    );
    tempDirs.push(appRoot);
    const clientDir = path.join(appRoot, 'dist', 'client');
    mkdirSync(clientDir, { recursive: true });
    createEmbeddedPluginFixture(appRoot);
    writeFileSync(
      path.join(appRoot, '.env'),
      [
        'API_CLIENT_STORAGE_PREFIX=EMBEDDED_',
        'API_CLIENT_STORAGE_TYPE=sessionStorage',
        'API_CLIENT_SHARE_TOKEN=true',
      ].join('\n'),
    );
    writeFileSync(
      path.join(clientDir, 'index.html'),
      '<script type="module" src="/app-template-default/assets/index.js"></script>',
    );

    const app = await createEmbeddedServer(
      createEmbeddedTestScope({
        id: 'app-template-default',
        basePath: '/app-template-default',
        config: { authSecret: 'test-auth-secret-at-least-32-characters' },
        rootDir: appRoot,
        clientDir,
      }),
    );

    const page = await requestApp(app, 'http://localhost/');
    const html = await page.text();
    expect(html).toContain(
      'window.__nocobase_api_client_storage_prefix__ = "EMBEDDED_";',
    );
    expect(html).toContain(
      'window.__nocobase_api_client_storage_type__ = "sessionStorage";',
    );
    expect(html).toContain(
      'window.__nocobase_api_client_share_token__ = true;',
    );
  });

  it('requires a database for authentication', async () => {
    const app = createTestApp({ database: false });
    await expect(
      requestApp(app, 'http://localhost/api/auth/session'),
    ).rejects.toThrow('Authentication requires a database connection.');
  });

  it('keeps app-local API routes on the standalone server when Vite dev proxy is enabled', async () => {
    let viteRequestCount = 0;
    const viteDevUrl = await startHttpStub(() => {
      viteRequestCount += 1;
    });
    const app = trackCloseable(
      await createIsolatedStandaloneServer({ viteDevUrl }),
    );
    const publicBasePath = app.application.publicBasePath;

    const response = await requestApp(
      app,
      `http://localhost${publicBasePath}/api/healthz`,
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      app: {
        name: app.application.appName,
        basePath: app.application.publicBasePath,
      },
      basePath: app.application.publicBasePath,
    });
    expect(viteRequestCount).toBe(0);
  });

  it('keeps a plugin API authenticated by the owning Route contribution', async () => {
    const app = trackCloseable(
      await createIsolatedStandaloneServer({ viteDevUrl: false }),
    );
    const baseUrl = `http://localhost${app.application.publicBasePath}`;
    const anonymous = await requestApp(app, `${baseUrl}/api/routes-example`);

    expect(anonymous.status).toBe(401);

    const signIn = await requestApp(
      app,
      `${baseUrl}/api/auth/sign-in/username`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
      },
    );
    const cookie = signIn.headers.get('set-cookie');
    expect(signIn.status).toBe(200);
    const response = await requestApp(app, `${baseUrl}/api/routes-example`, {
      headers: { cookie: cookie ?? '' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      plugin: '@nocobase/app-plugin-routes-example',
    });
  });

  it('loads the system info API from the registered app plugin', async () => {
    const app = trackCloseable(
      await createIsolatedStandaloneServer({ viteDevUrl: false }),
    );
    const baseUrl = `http://localhost${app.application.publicBasePath}`;
    const signIn = await requestApp(
      app,
      `${baseUrl}/api/auth/sign-in/username`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
      },
    );
    const cookie = signIn.headers.get('set-cookie');
    expect(signIn.status).toBe(200);
    expect(cookie).toContain('.session_token=');
    const response = await requestApp(app, `${baseUrl}/api/system-info`, {
      headers: { cookie: cookie ?? '' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      packageName: '@nocobase/app-plugin-system-info',
      version: declaredPluginVersion('@nocobase/app-plugin-system-info'),
      nodeVersion: process.version,
      serverTime: expect.any(String),
    });
  });

  it('redirects HTML navigation to installation in install mode', async () => {
    vi.stubEnv('APP_BASE_PATH', '/main');
    vi.stubEnv('AUTH_SECRET', 'nocobase-install-mode-test-secret');
    const viteDevUrl = await startHttpStub((_request, response) => {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end('<main>installation page</main>');
    });
    const app = trackCloseable(
      await createIsolatedStandaloneServer({ viteDevUrl }),
    );

    const redirectResponse = await requestApp(app, 'http://localhost/main/', {
      headers: { Accept: 'text/html' },
    });
    expect(redirectResponse.status).toBe(302);
    expect(redirectResponse.headers.get('Location')).toBe('/main/install');

    const installResponse = await requestApp(
      app,
      'http://localhost/main/install',
      {
        headers: { Accept: 'text/html' },
      },
    );
    expect(installResponse.status).toBe(200);
    expect(installResponse.headers.get('Location')).toBeNull();
    await expect(installResponse.text()).resolves.toContain(
      'installation page',
    );
  });

  it('dispatches jobs from enabled app plugins', async () => {
    vi.stubEnv('QUEUE_JOBS_AUTO_LOAD', 'false');
    const app = trackCloseable(
      await createIsolatedStandaloneServer({ viteDevUrl: false }),
    );
    const baseUrl = `http://localhost${app.application.publicBasePath}`;
    const anonymous = await requestApp(app, `${baseUrl}/api/queue-example`);
    expect(anonymous.status).toBe(401);

    const signIn = await requestApp(
      app,
      `${baseUrl}/api/auth/sign-in/username`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
      },
    );
    const cookie = signIn.headers.get('set-cookie');
    expect(signIn.status).toBe(200);
    const response = await requestApp(app, `${baseUrl}/api/queue-example`, {
      headers: { cookie: cookie ?? '' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jobId: expect.any(String),
      job: 'QueueExample',
      queue: 'default',
      syncExecutions: 1,
    });
  });

  it('exposes services registered by enabled plugin providers', async () => {
    const app = trackCloseable(
      await createIsolatedStandaloneServer({ viteDevUrl: false }),
    );
    const response = await requestApp(
      app,
      `http://localhost${app.application.publicBasePath}/api/service-provider-example/status`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: '@nocobase/app-plugin-service-provider-example',
      status: 'ready',
      startedAt: expect.any(String),
    });
  });

  it('mounts standalone app-local routes behind the public base path', async () => {
    const app = trackCloseable(
      await createIsolatedStandaloneServer({ viteDevUrl: false }),
    );
    const publicBasePath = app.application.publicBasePath;
    const expectedHealth = {
      ok: true,
      app: {
        name: app.application.appName,
        basePath: publicBasePath,
      },
      basePath: publicBasePath,
    };

    const rootHealth = await requestApp(app, 'http://localhost/healthz');
    const appHealth = await requestApp(
      app,
      `http://localhost${publicBasePath}/api/healthz`,
    );
    const bareLocalApi = await requestApp(app, 'http://localhost/api/healthz');

    await expect(appHealth.json()).resolves.toEqual(expectedHealth);
    expect(rootHealth.status).toBe(404);
    expect(bareLocalApi.status).toBe(404);
    await app.close();
  });

  it('mounts standalone WebSocket handlers behind the public base path', async () => {
    const app = trackCloseable(
      await createIsolatedStandaloneServer({ viteDevUrl: false }),
    );
    const publicBasePath = app.application.publicBasePath;

    const bareResult = await app.websocket?.(
      new Request('http://localhost/ws'),
    );
    const mountedResult = await app.websocket?.(
      new Request(`http://localhost${publicBasePath}/ws`),
    );

    expect(bareResult).toBeNull();
    expect(mountedResult).toMatchObject({
      onMessage: expect.any(Function),
    });
  });

  it('accepts standalone WebSocket upgrades through the public base path', async () => {
    const app = trackCloseable(
      await createIsolatedStandaloneServer({ viteDevUrl: false }),
    );
    const serverUrl = await startStandaloneTestServer(app);
    const websocket = new WebSocket(
      `${serverUrl}${app.application.publicBasePath}/ws`,
    );

    await waitForWebSocketOpen(websocket);
    const subscribed = waitForWebSocketJsonMessage(
      websocket,
      (message) => message.type === 'subscribed',
    );
    websocket.send(
      JSON.stringify({
        type: 'subscribe',
        id: 'test-topic',
        topic: TEST_REALTIME_TOPIC,
      }),
    );

    await expect(subscribed).resolves.toMatchObject({
      type: 'subscribed',
      id: 'test-topic',
      topic: TEST_REALTIME_TOPIC,
      subscriptionId: expect.any(String),
    });

    const close = waitForWebSocketClose(websocket);
    websocket.close();
    await close;
  });

  it('closes standalone WebSocket connections when the app closes', async () => {
    const app = trackCloseable(
      await createIsolatedStandaloneServer({ viteDevUrl: false }),
    );
    const serverUrl = await startStandaloneTestServer(app);
    const websocket = new WebSocket(
      `${serverUrl}${app.application.publicBasePath}/ws`,
    );

    await waitForWebSocketOpen(websocket);
    const close = waitForWebSocketClose(websocket);

    await app.close();

    await expect(close).resolves.toMatchObject({
      code: 1001,
      reason: 'app runtime closed',
    });
  });

  it('returns a closable standalone app', async () => {
    const app = trackCloseable(
      await createIsolatedStandaloneServer({ viteDevUrl: false }),
    );

    expect(typeof app.close).toBe('function');
    await expect(app.close()).resolves.toBeUndefined();
    await expect(app.close()).resolves.toBeUndefined();
  });

  it('owns standalone cancellation and disposal through its scope', async () => {
    const scope = createStandaloneRuntimeScope({
      rootDir: path.resolve(import.meta.dirname, '../..'),
      env: { APP_VITE_DEV_URL: 'false' },
    });
    const events: string[] = [];
    scope.onBeforeDestroy(() => {
      events.push('before-destroy');
    });
    scope.registerDisposer('test-resource', () => {
      events.push('dispose');
    });

    expect(scope.mode).toBe('standalone');
    expect(scope.signal.aborted).toBe(false);

    await scope.destroy();
    await scope.destroy();

    expect(scope.signal.aborted).toBe(true);
    expect(events).toEqual(['before-destroy', 'dispose']);
  });

  it('proxies standalone SPA routes to Vite dev server with the public base path restored', async () => {
    const viteDevUrl = await startHttpStub((_request, response) => {
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          method: _request.method,
          url: _request.url,
          origin: _request.headers.origin,
          referer: _request.headers.referer,
        }),
      );
    });
    const app = trackCloseable(
      await createIsolatedStandaloneServer({ viteDevUrl }),
    );
    const publicBasePath = app.application.publicBasePath;
    const requestPath = `${publicBasePath}/settings?tab=apps`;

    const response = await requestApp(app, `http://localhost${requestPath}`, {
      headers: {
        origin: 'http://localhost',
        referer: `http://localhost${publicBasePath}/`,
      },
    });

    expect(response.status).toBe(200);
    const viteOrigin = new URL(viteDevUrl).origin;
    await expect(response.json()).resolves.toEqual({
      method: 'GET',
      url: requestPath,
      origin: viteOrigin,
      referer: `${viteOrigin}${publicBasePath}/`,
    });
    await app.close();
  });

  it('injects browser runtime config when serving the production SPA index', async () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-template-default-client-'),
    );
    tempDirs.push(root);
    const indexPath = path.join(root, 'index.html');
    writeFileSync(
      indexPath,
      [
        '<!doctype html>',
        '<html>',
        '<body>',
        '<div id="root"></div>',
        '<script type="module" src="/app-template-default/assets/index.js"></script>',
        '</body>',
        '</html>',
      ].join(''),
    );

    const app = createTestApp({
      publicBasePath: '/app-template-default',
      spa: {
        indexPath,
      },
    });

    const response = await requestApp(app, 'http://localhost/settings');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      'window.NOCOBASE_PORTAL_BASE = "/app-template-default/";',
    );
    expect(html).toContain(
      'window.NOCOBASE_API_URL = "/app-template-default/api";',
    );
    expect(html.indexOf('window.NOCOBASE_PORTAL_BASE')).toBeLessThan(
      html.indexOf('<script type="module"'),
    );
  });

  it('serves production SPA assets before the SPA fallback', async () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-template-default-client-'),
    );
    tempDirs.push(root);
    mkdirSync(path.join(root, 'assets'));
    writeFileSync(
      path.join(root, 'index.html'),
      '<script type="module" src="/app-template-default/assets/index.js"></script>',
    );
    writeFileSync(
      path.join(root, 'assets/index.js'),
      'console.log("app-template-default asset");',
    );

    const app = createTestApp({
      publicBasePath: '/app-template-default',
      spa: {
        indexPath: path.join(root, 'index.html'),
      },
    });

    const response = await requestApp(app, 'http://localhost/assets/index.js');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/javascript; charset=utf-8',
    );
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    );
    await expect(response.text()).resolves.toBe(
      'console.log("app-template-default asset");',
    );
  });

  it('does not return the SPA index for missing production SPA assets', async () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-template-default-client-'),
    );
    tempDirs.push(root);
    mkdirSync(path.join(root, 'assets'));
    writeFileSync(
      path.join(root, 'index.html'),
      '<main>app-template-default app</main>',
    );

    const app = createTestApp({
      publicBasePath: '/app-template-default',
      spa: {
        indexPath: path.join(root, 'index.html'),
      },
    });

    const response = await requestApp(
      app,
      'http://localhost/assets/missing.js',
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      error: 'Not found',
    });
  });
});

async function startStandaloneTestServer(
  app: StandaloneServer,
): Promise<string> {
  let listenInfo: AddressInfo | undefined;
  const server = (await startNodeAppServer(app, {
    hostname: '127.0.0.1',
    port: 0,
    registerProcessSignals: false,
    onListen: (info) => {
      listenInfo = info;
    },
  })) as Server;
  servers.push(server);

  if (!listenInfo) {
    throw new Error('Node app server started without listen information.');
  }

  return `ws://${normalizeListenAddress(listenInfo)}:${listenInfo.port}`;
}

function normalizeListenAddress(info: AddressInfo): string {
  return info.address === '::' ? '127.0.0.1' : info.address;
}

function waitForWebSocketOpen(websocket: WebSocket): Promise<void> {
  if (websocket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      websocket.removeEventListener('open', handleOpen);
      websocket.removeEventListener('error', handleError);
    };
    const handleOpen = (): void => {
      cleanup();
      resolve();
    };
    const handleError = (): void => {
      cleanup();
      reject(new Error('WebSocket failed to open.'));
    };

    websocket.addEventListener('open', handleOpen);
    websocket.addEventListener('error', handleError);
  });
}

function waitForWebSocketJsonMessage(
  websocket: WebSocket,
  predicate: (message: RealtimeServerMessage) => boolean,
): Promise<RealtimeServerMessage> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      websocket.removeEventListener('message', handleMessage);
      websocket.removeEventListener('error', handleError);
    };
    const handleMessage = (event: MessageEvent): void => {
      try {
        const message = JSON.parse(String(event.data)) as RealtimeServerMessage;
        if (!predicate(message)) {
          return;
        }

        cleanup();
        resolve(message);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    const handleError = (): void => {
      cleanup();
      reject(new Error('WebSocket message failed.'));
    };

    websocket.addEventListener('message', handleMessage);
    websocket.addEventListener('error', handleError);
  });
}

function waitForWebSocketClose(websocket: WebSocket): Promise<CloseEvent> {
  return new Promise((resolve) => {
    websocket.addEventListener('close', (event) => resolve(event), {
      once: true,
    });
  });
}

interface TestWebSocket extends AppWebSocket {
  readonly messages: RealtimeServerMessage[];
}

function createTestWebSocket(): TestWebSocket {
  let readyState: AppWebSocketReadyState = 1;
  const messages: RealtimeServerMessage[] = [];

  return {
    url: new URL('ws://localhost/ws'),
    protocol: null,
    messages,
    get readyState() {
      return readyState;
    },
    send(data) {
      messages.push(JSON.parse(String(data)) as RealtimeServerMessage);
    },
    close() {
      readyState = 3;
    },
  };
}

function startHttpStub(
  handler?: Parameters<typeof createHttpServer>[0],
): Promise<string> {
  const server = createHttpServer(handler);
  servers.push(server);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to resolve Vite stub address.'));
        return;
      }

      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

interface CreateTestAppOptions {
  publicOrigin?: string;
  publicBasePath?: string;
  database?: DatabaseManager | false;
  queue?: AppQueueConfig;
  plugins?: readonly AppServerPlugin<AppConfig>[];
  spa?: {
    indexPath?: string;
    runtime?: AppConfig['spa']['runtime'];
  };
}

function createTestApp(options: CreateTestAppOptions = {}): TestApp {
  const publicBasePath = normalizeBasePath(
    options.publicBasePath ?? '/app-template-default',
  );
  const config = {
    app: {
      name: resolveAppNameFromBasePath(publicBasePath, 'app-template-default'),
      publicOrigin: options.publicOrigin,
      publicBasePath,
      internalBasePath: '',
      publicApiUrl: joinBasePath(publicBasePath, '/api'),
    },
    auth: {
      secret: 'test-auth-secret-at-least-32-characters',
      emailAndPassword: {
        enabled: true,
      },
    },
    caching: createDefaultCachingConfig(),
    database: {
      default: 'none',
      connections: {},
      migrations: {
        directory: '',
        autoRun: false,
      },
      seeds: {
        directory: '',
        autoRun: false,
      },
    },
    drive: undefined,
    logging: createSilentLoggingConfig(),
    queue: options.queue ?? createSyncQueueConfig(),
    session: createNullSessionConfig(),
    workflow: {
      sourceRoot: path.resolve(process.cwd(), 'server/workflows'),
      distRoot: path.resolve(process.cwd(), 'dist/server/workflows'),
      artifactDisk: 'local',
      sourceResolverDiagnostic: false,
      production: false,
    },
    snowflake: {
      workerId: 0,
    },
    server: {
      host: '127.0.0.1',
      port: 0,
      startLog: false,
      viteDevUrl: undefined,
    },
    spa: {
      indexPath:
        options.spa?.indexPath ?? path.resolve(process.cwd(), 'index.html'),
      runtime: options.spa?.runtime ?? {
        storagePrefix: 'NOCOBASE_',
        storageType: 'localStorage',
        shareToken: false,
      },
      runtimeGlobals: createNocoBaseSpaRuntimeGlobals({
        appBasePath: publicBasePath,
        apiUrl: joinBasePath(publicBasePath, '/api'),
        storagePrefix: options.spa?.runtime?.storagePrefix ?? 'NOCOBASE_',
        storageType: options.spa?.runtime?.storageType ?? 'localStorage',
        shareToken: options.spa?.runtime?.shareToken ?? false,
      }),
    },
  } as AppConfig;
  const paths = createConfigPaths({ rootDir: '/test/app-template-default' });
  const database =
    options.database === false
      ? undefined
      : (options.database ?? createMockDatabase([]));
  class TestDatabaseProvider extends ServiceProvider<Application<AppConfig>> {
    public readonly name: string = 'test-database';

    public override register(): void {
      if (database) {
        this.app.container.instance(databaseManagerToken, database);
      }
    }

    public override async shutdown(): Promise<void> {
      await database?.destroy();
    }
  }
  const app = new Application({ config, paths });
  if (database) {
    app.addProvider(TestDatabaseProvider);
  }
  app.addProvider(LoggingProvider);
  app.addProvider(CachingProvider);
  app.addProvider(IdGeneratorProvider);
  app.addProvider(SessionProvider);
  app.addProvider(DriveProvider);
  app.addProvider(QueueProvider);
  app.addHttpMiddleware(requestLoggingMiddleware);
  app.addHttpMiddleware(sessionHttpMiddleware);
  app.addRoutes(healthCheckApiRoutes);
  app.addServerPlugins(
    createResolvedTestServerPlugins([
      authenticationServerPlugin,
      authorizationServerPlugin,
      ...(options.plugins ?? []),
    ]),
  );
  app.addRoutes(spaRootRoutes);
  app.registerProviders();

  return trackCloseable(
    Object.assign(app, {
      close: (): Promise<void> => app.shutdown(),
    }),
  );
}

function createResolvedTestServerPlugins(
  plugins: readonly AppServerPlugin<AppConfig>[],
): ResolvedAppServerPlugins<AppConfig> {
  const definitions = defineServerPlugins<AppConfig>(plugins);

  return {
    appPackageName: '@nocobase/app-template-default',
    plugins: definitions.plugins.map((definition) => ({
      definition,
      metadata: {
        packageName: definition.packageName,
        version: 'test',
        rootDir: `/test/plugins/${definition.packageName}`,
        jobLocations: [],
      },
    })),
  };
}

function createEmbeddedTestScope(
  options: Omit<AppScope, 'registerDisposer'>,
  registeredDisposers: RegisteredTestDisposer[] = [],
): AppScope {
  const lifecycle = createAppDisposerRegistry();
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const rootDir = options.paths?.rootDir ?? options.rootDir ?? sourceRoot;
  const databaseDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-app-template-default-database-'),
  );
  tempDirs.push(databaseDir);
  apps.push({
    close: () => lifecycle.disposeAll(),
  });

  return {
    ...options,
    env: {
      ...readEnvFiles([
        path.join(rootDir, '.env'),
        path.join(rootDir, '.env.local'),
      ]),
      DB_DIALECT: 'sqlite',
      ...options.env,
      DB_DATABASE: path.join(databaseDir, 'database.sqlite'),
    },
    paths:
      options.paths ??
      (options.rootDir
        ? undefined
        : {
            rootDir: sourceRoot,
            serverDir: path.join(sourceRoot, 'server'),
            databaseDir: path.join(sourceRoot, 'database'),
            clientDir:
              options.clientDir ?? path.join(sourceRoot, 'dist/client'),
            storageDir: options.dataDir ?? path.join(sourceRoot, 'storage'),
          }),
    config: options.config ?? {
      authSecret: 'test-auth-secret-at-least-32-characters',
    },
    registerDisposer(name, dispose) {
      registeredDisposers.push({ name, dispose });
      lifecycle.registerDisposer(name, dispose);
    },
  };
}

async function createIsolatedStandaloneServer(
  options: StandaloneServerOptions = {},
): Promise<StandaloneServer> {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const databaseDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-app-template-default-standalone-database-'),
  );
  tempDirs.push(databaseDir);

  return createStandaloneServer({
    ...options,
    env: {
      DB_DIALECT: 'sqlite',
      ...options.env,
      DB_DATABASE: path.join(databaseDir, 'database.sqlite'),
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir: path.join(sourceRoot, 'storage'),
    },
  });
}

function createEmbeddedPluginFixture(rootDir: string): void {
  const pluginPackages = [
    '@nocobase/app-plugin-authentication',
    '@nocobase/app-plugin-authorization',
  ];
  writeFileSync(
    path.join(rootDir, 'package.json'),
    JSON.stringify({
      name: '@nocobase/app-template-test',
      nocobase: {
        plugins: Object.fromEntries(
          pluginPackages.map((packageName) => [packageName, { enabled: true }]),
        ),
      },
    }),
  );

  for (const packageName of pluginPackages) {
    const packageRoot = path.dirname(
      require.resolve(`${packageName}/package.json`),
    );
    const target = path.join(
      rootDir,
      'node_modules',
      ...packageName.split('/'),
    );
    mkdirSync(path.dirname(target), { recursive: true });
    symlinkSync(packageRoot, target, 'dir');
  }
}

function trackCloseable<T extends CloseableResource>(resource: T): T {
  apps.push(resource);
  return resource;
}

function createMockDatabase(
  rows: unknown[],
  insertedRows: unknown[] = [],
): DatabaseManager {
  const query = createMockQuery(rows, insertedRows);
  return {
    connection: (() => ({ query })) as DatabaseManager['connection'],
    builder: (() => {
      throw new Error('Not implemented.');
    }) as DatabaseManager['builder'],
    query: (() => query) as DatabaseManager['query'],
    connect: (() =>
      Promise.reject(
        new Error('Not implemented.'),
      )) as DatabaseManager['connect'],
    transaction: (() =>
      Promise.reject(
        new Error('Not implemented.'),
      )) as DatabaseManager['transaction'],
    disconnect: (() => Promise.resolve()) as DatabaseManager['disconnect'],
    reconnect: (() =>
      Promise.reject(
        new Error('Not implemented.'),
      )) as DatabaseManager['reconnect'],
    destroy: (() => Promise.resolve()) as DatabaseManager['destroy'],
  };
}

function createMockQuery(
  rows: unknown[],
  insertedRows: unknown[],
): QueryAdapter {
  const selectQuery = {
    select: () => selectQuery,
    orderBy: () => selectQuery,
    execute: () => Promise.resolve(rows),
  };
  const insertQuery = {
    values: (data: unknown | readonly unknown[]) => {
      if (Array.isArray(data)) {
        insertedRows.push(...data);
      } else {
        insertedRows.push(data);
      }

      return insertQuery;
    },
    execute: () => Promise.resolve({ insertedCount: insertedRows.length }),
    compile: () => ({ sql: '', parameters: [] }),
  };

  return {
    selectFrom: () => selectQuery,
    insertInto: () => insertQuery,
    updateTable: () => {
      throw new Error('Not implemented.');
    },
    deleteFrom: () => {
      throw new Error('Not implemented.');
    },
  } as unknown as QueryAdapter;
}
