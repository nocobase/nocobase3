// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { serve } from '@hono/node-server';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { Hono } from 'hono';
import {
  createDefaultCachingConfig,
  type CachingConfig,
} from '@nocobase/caching';
import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import type {
  AppWebSocket,
  AppWebSocketReadyState,
} from '@nocobase/app-server-kit/websocket';
import type { DatabaseManager, QueryAdapter } from '@nocobase/app-database';
import { createSilentLoggingConfig } from '@nocobase/logging';
import { createSyncQueueConfig, type AppQueueConfig } from '@nocobase/queue';
import {
  createNullSessionConfig,
  type AppSessionConfig,
} from '@nocobase/session';
import {
  joinBasePath,
  normalizeBasePath,
  resolveAppNameFromBasePath,
} from '@nocobase/app-server-kit/support';

import {
  createApp,
  type CreateAppOptions,
  type AppDisposer,
  type AppScope,
  createServer as createEmbeddedServer,
  createStandaloneRuntime,
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/index.ts';
import { registerStandaloneWebSocketUpgradeHandler } from '../../server/standalone.ts';
import type { AppConfig } from '../../server/config/index.ts';
import { createRealtimeService } from '../../server/realtime/service.ts';
import type { RealtimeServerMessage } from '../../server/realtime/protocol.ts';
import { createAppDisposerRegistry } from '../../server/runtime/index.ts';
import { createPublicBasePathAdapter } from '../../server/runtime/app.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

interface CloseableResource {
  close(): Promise<void>;
}

type TestApp = ReturnType<typeof createApp> & CloseableResource;

interface RegisteredTestDisposer {
  name: string;
  dispose: AppDisposer;
}

const apps: CloseableResource[] = [];
const servers: Server[] = [];
const tempDirs: string[] = [];
const TEST_REALTIME_TOPIC = 'test:realtime';

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
  it('creates embedded apps from a scope', async () => {
    const app = await createEmbeddedServer(
      createEmbeddedTestScope({
        id: 'app-template-default',
        basePath: '/embedded-app-template-default',
      }),
    );

    const response = await app.request('http://localhost/api/healthz');
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

    const filesResponse = await app.request(
      'http://localhost/api/files/missing/content?access=embedded-secret',
    );
    expect(filesResponse.status).toBe(403);
    await expect(filesResponse.json()).resolves.toEqual({
      error: 'The file access credential is invalid.',
      code: 'INVALID_ACCESS',
    });
  });

  it('serves an app-local HTML route outside the API namespace', async () => {
    const app = createTestApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: false,
    });

    const response = await app.request('http://localhost/hello');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('<h1>Hello from NocoBase</h1>');
    expect(html).toContain(
      'This page is rendered by an app-local server route.',
    );
  });

  it('adds the public base path to app-local redirects', async () => {
    const app = new Hono();
    app.get('/login', (context) => context.redirect('/install'));

    const mounted = createPublicBasePathAdapter(app, '/main');
    const response = await mounted.request('http://localhost/main/login');

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/main/install');
  });

  it('exposes an app-local WebSocket handler outside the API namespace', async () => {
    const app = createTestApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: false,
    });

    const response = await app.request('http://localhost/ws');
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
      'runtime',
      'app-deps',
      'realtime-service',
      'plugin:@nocobase/app-plugin-realtime-example:clock-publisher',
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
        config: {
          authSecret: 'test-auth-secret-at-least-32-characters',
          filesStorageDriver: 's3',
          filesS3Bucket: 'private-files',
          filesS3AccessKeyId: 'browser-hidden-access-key',
          filesS3SecretAccessKey: 'browser-hidden-secret-key',
        },
        clientDir: root,
      }),
    );

    const response = await app.request('http://localhost/');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      'window.NOCOBASE_PORTAL_BASE = "/app-template-default/";',
    );
    expect(html).toContain(
      'window.NOCOBASE_API_URL = "/app-template-default/v2/api";',
    );
    expect(html).not.toContain('browser-hidden-access-key');
    expect(html).not.toContain('browser-hidden-secret-key');
  });

  it('reads embedded runtime config from the application root without using process.env', async () => {
    const nocoBaseApiUrl = await startHttpStub((_request, response) => {
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          url: _request.url,
          forwardedPrefix: _request.headers['x-forwarded-prefix'],
        }),
      );
    });
    const appRoot = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-template-default-embedded-root-'),
    );
    tempDirs.push(appRoot);
    const clientDir = path.join(appRoot, 'dist', 'client');
    mkdirSync(clientDir, { recursive: true });
    writeFileSync(
      path.join(appRoot, '.env'),
      [
        `NOCOBASE_API_PROXY_TARGET=${nocoBaseApiUrl}/nocobase/api/`,
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

    const api = await app.request(
      'http://localhost/v2/api/oidc:checkRedirect?redirect=%2Fapp-template-default%2F',
    );
    await expect(api.json()).resolves.toEqual({
      url: '/nocobase/api/oidc:checkRedirect?redirect=%2Fapp-template-default%2F',
      forwardedPrefix: '/v2/api',
    });

    const page = await app.request('http://localhost/');
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

  it('proxies app-local /v2/api requests to the configured NocoBase API URL', async () => {
    const nocoBaseApiUrl = await startHttpStub((_request, response) => {
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          method: _request.method,
          url: _request.url,
          host: _request.headers.host,
          origin: _request.headers.origin,
          referer: _request.headers.referer,
          forwardedHost: _request.headers['x-forwarded-host'],
          forwardedPrefix: _request.headers['x-forwarded-prefix'],
          forwardedProto: _request.headers['x-forwarded-proto'],
        }),
      );
    });
    const app = createTestApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: `${nocoBaseApiUrl}/nocobase/api/`,
    });

    const response = await app.request(
      'http://localhost/v2/api/systemSettings:get?locale=zh-CN',
      {
        headers: {
          host: '127.0.0.1:13000',
          origin: 'http://127.0.0.1:13000',
          referer: 'http://127.0.0.1:13000/app-template-default/login',
        },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      method: 'GET',
      url: '/nocobase/api/systemSettings:get?locale=zh-CN',
      host: new URL(nocoBaseApiUrl).host,
      // The browser's own origin and referer are relayed untouched. Rewriting them to the upstream
      // address is what makes `auth:signIn` answer 403 Invalid sign-in origin.
      origin: 'http://127.0.0.1:13000',
      referer: 'http://127.0.0.1:13000/app-template-default/login',
      forwardedHost: '127.0.0.1:13000',
      forwardedPrefix: '/v2/api',
      forwardedProto: 'http',
    });
  });

  /**
   * Pins the header contract that `auth:signIn` validates against.
   *
   * The upstream derives requestOrigin as `x-forwarded-proto || protocol` + `://` +
   * `x-forwarded-host || host`, then demands that `origin` equal it verbatim. A mismatch is answered
   * with 403 Invalid sign-in origin -- which surfaces to users as "I cannot log in", several layers
   * away from the cause.
   *
   * This case is worth its own test because it cannot be caught by hand: when the proxy target is the
   * public site, the request crosses that site's reverse proxy on the way out and any bad
   * `x-forwarded-*` gets corrected there, while a rewritten origin coincidentally matches the site.
   * Both faults cancel. Only a deployment that proxies straight to the upstream reveals them.
   */
  it('relays the browser origin and protocol so the upstream sign-in origin check passes', async () => {
    const nocoBaseApiUrl = await startHttpStub((_request, response) => {
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          origin: _request.headers.origin,
          referer: _request.headers.referer,
          forwardedHost: _request.headers['x-forwarded-host'],
          forwardedProto: _request.headers['x-forwarded-proto'],
        }),
      );
    });
    const app = createTestApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: `${nocoBaseApiUrl}/nocobase/api/`,
    });

    // A TLS-terminating proxy in front of this process: the site is https, but this hop is cleartext
    // and its x-forwarded-* headers carry the browser's real context.
    const response = await app.request('http://localhost/v2/api/auth:signIn', {
      method: 'POST',
      headers: {
        host: 'apps.example.com',
        origin: 'https://apps.example.com',
        referer: 'https://apps.example.com/app-template-default/login',
        'x-forwarded-host': 'apps.example.com',
        'x-forwarded-proto': 'https',
      },
    });

    expect(response.status).toBe(200);
    const forwarded = (await response.json()) as Record<string, string>;

    // Existing x-forwarded-* must survive. Overwriting them with this connection's details would
    // report the https site as http, and the origin comparison below would fail on the scheme alone.
    expect(forwarded.forwardedProto).toBe('https');
    expect(forwarded.forwardedHost).toBe('apps.example.com');
    expect(forwarded.origin).toBe('https://apps.example.com');
    expect(forwarded.referer).toBe(
      'https://apps.example.com/app-template-default/login',
    );

    // The check the upstream actually performs.
    const requestOrigin = `${forwarded.forwardedProto}://${forwarded.forwardedHost}`;
    expect(forwarded.origin).toBe(requestOrigin);
  });

  it('returns a JSON error when the API proxy target is not configured', async () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-template-default-client-'),
    );
    tempDirs.push(root);
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

    const response = await app.request(
      'http://localhost/v2/api/oidc:checkRedirect?redirect=%2Fapp-template-default%2F',
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      error: 'NocoBase API proxy target is not configured.',
    });
  });

  it('requires a database for authentication', () => {
    expect(() => createTestApp({ database: false })).toThrow(
      'Authentication requires a database connection.',
    );
  });

  it('reads app settings from the configured database', async () => {
    const rows = [
      {
        key: 'site.title',
        value: 'NocoBase',
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
      },
    ];
    const app = createTestApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: false,
      database: createMockDatabase(rows),
    });

    const response = await app.request('http://localhost/api/app-settings');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      settings: rows,
    });
  });

  it('serves a cache API example with cacheable getOrSet', async () => {
    const app = createTestApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: false,
      caching: createTestCaching(),
    });

    const firstResponse = await app.request('http://localhost/api/cache/demo');
    const firstPayload = await firstResponse.json();
    const secondResponse = await app.request('http://localhost/api/cache/demo');
    const secondPayload = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstPayload).toMatchObject({
      key: 'demo',
      ttl: 30_000,
      cached: false,
      value: {
        generatedAt: expect.any(String),
        id: expect.any(String),
      },
    });
    expect(secondResponse.status).toBe(200);
    expect(secondPayload).toEqual({
      ...firstPayload,
      cached: true,
    });

    const deleteResponse = await app.request(
      'http://localhost/api/cache/demo',
      {
        method: 'DELETE',
      },
    );

    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({
      key: 'demo',
      deleted: true,
    });

    const thirdResponse = await app.request('http://localhost/api/cache/demo');
    const thirdPayload = await thirdResponse.json();

    expect(thirdResponse.status).toBe(200);
    expect(thirdPayload.cached).toBe(false);
    expect(thirdPayload.value.id).not.toBe(firstPayload.value.id);
  });

  it('serves a session API example with cookie-backed persistence', async () => {
    const app = createTestApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: false,
      session: createTestSession(),
    });

    const emptyResponse = await app.request('http://localhost/api/session');
    await expect(emptyResponse.json()).resolves.toEqual({
      enabled: true,
      id: null,
      data: null,
    });

    const touchResponse = await app.request(
      'http://localhost/api/session/touch',
      {
        method: 'POST',
      },
    );
    const cookie = firstCookie(touchResponse);
    const touchPayload = await touchResponse.json();

    expect(touchResponse.status).toBe(200);
    expect(cookie).toContain('nocobase_session=');
    expect(touchPayload).toMatchObject({
      enabled: true,
      id: expect.any(String),
      data: {
        visits: 1,
        touchedAt: expect.any(String),
      },
    });

    const secondTouchResponse = await app.request(
      'http://localhost/api/session/touch',
      {
        method: 'POST',
        headers: {
          cookie,
        },
      },
    );
    const updatedCookie = firstCookie(secondTouchResponse);
    const infoResponse = await app.request('http://localhost/api/session', {
      headers: {
        cookie: updatedCookie,
      },
    });

    await expect(infoResponse.json()).resolves.toMatchObject({
      enabled: true,
      id: touchPayload.id,
      data: {
        visits: 2,
        touchedAt: expect.any(String),
      },
    });

    const deleteResponse = await app.request('http://localhost/api/session', {
      method: 'DELETE',
      headers: {
        cookie: updatedCookie,
      },
    });

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.headers.get('set-cookie')).toContain('Max-Age=0');
    await expect(deleteResponse.json()).resolves.toEqual({
      destroyed: true,
    });
  });

  it('requires authentication for unmatched protected API routes', async () => {
    const app = createTestApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: false,
    });

    const response = await app.request('http://localhost/api/upload', {
      method: 'POST',
    });

    expect(response.status).toBe(401);
  });

  it('strips compressed upstream response headers before returning proxied API responses', async () => {
    const payload = JSON.stringify({ ok: true });
    const compressedPayload = gzipSync(payload);
    const nocoBaseApiUrl = await startHttpStub((_request, response) => {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('content-encoding', 'gzip');
      response.setHeader(
        'content-length',
        String(compressedPayload.byteLength),
      );
      response.end(compressedPayload);
    });
    const app = createTestApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: `${nocoBaseApiUrl}/nocobase/api/`,
    });

    const response = await app.request(
      'http://localhost/v2/api/systemSettings:get',
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('content-length')).toBeNull();
    await expect(response.text()).resolves.toBe(payload);
  });

  it('keeps app-local API routes on the standalone server when Vite dev proxy is enabled', async () => {
    let viteRequestCount = 0;
    const viteDevUrl = await startHttpStub(() => {
      viteRequestCount += 1;
    });
    const runtime = createStandaloneRuntime();
    const app = trackCloseable(await createStandaloneServer({ viteDevUrl }));
    const publicBasePath = runtime.config.app.publicBasePath;

    const response = await app.request(
      `http://localhost${publicBasePath}/api/healthz`,
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      app: {
        name: runtime.config.app.name,
        basePath: runtime.config.app.publicBasePath,
      },
      basePath: runtime.config.app.publicBasePath,
    });
    expect(viteRequestCount).toBe(0);
  });

  it('mounts plugin routes while keeping the API fallback protected', async () => {
    const app = createTestApp({
      nocoBaseApiUrl: false,
      pluginRoutes: [
        {
          packageName: '@nocobase/app-plugin-test-routes',
          registerRoutes({ app }) {
            app.get('/plugin-public', (context) =>
              context.json({ public: true }),
            );
          },
        },
      ],
    });

    const publicResponse = await app.request('http://localhost/plugin-public');
    const unknownResponse = await app.request(
      'http://localhost/api/not-mounted',
    );
    const protectedResponse = await app.request('http://localhost/api/apps');

    expect(publicResponse.status).toBe(200);
    expect(unknownResponse.status).toBe(401);
    expect(protectedResponse.status).toBe(401);
    await expect(publicResponse.json()).resolves.toEqual({ public: true });
  });

  it('redirects HTML navigation to installation in install mode', async () => {
    vi.stubEnv('AUTH_SECRET', 'nocobase-install-mode-test-secret');
    const app = trackCloseable(
      await createStandaloneServer({ viteDevUrl: false }),
    );

    const redirectResponse = await app.request('http://localhost/main/', {
      headers: { Accept: 'text/html' },
    });
    expect(redirectResponse.status).toBe(302);
    expect(redirectResponse.headers.get('Location')).toBe('/main/install');

    const installResponse = await app.request('http://localhost/main/install', {
      headers: { Accept: 'text/html' },
    });
    expect(installResponse.status).toBe(200);
    expect(installResponse.headers.get('Location')).toBeNull();
  });

  it('dispatches jobs from enabled app plugins', async () => {
    vi.stubEnv('QUEUE_JOBS_AUTO_LOAD', 'false');
    const runtime = createStandaloneRuntime();
    const app = trackCloseable(
      await createStandaloneServer({ viteDevUrl: false }),
    );
    const response = await app.request(
      `http://localhost${runtime.config.app.publicBasePath}/queue-example`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jobId: expect.any(String),
      job: 'QueueExample',
      queue: 'default',
      syncExecutions: 1,
    });
  });

  it('mounts standalone app-local routes behind the public base path', async () => {
    const runtime = createStandaloneRuntime();
    const app = trackCloseable(
      await createStandaloneServer({ viteDevUrl: false }),
    );
    const publicBasePath = runtime.config.app.publicBasePath;
    const expectedHealth = {
      ok: true,
      app: {
        name: runtime.config.app.name,
        basePath: publicBasePath,
      },
      basePath: publicBasePath,
    };

    const rootHealth = await app.request('http://localhost/healthz');
    const appHealth = await app.request(
      `http://localhost${publicBasePath}/api/healthz`,
    );
    const bareLocalApi = await app.request('http://localhost/api/healthz');
    const files = await app.request(
      `http://localhost${publicBasePath}/api/files/missing/content?access=standalone-secret`,
    );
    const oldUpload = await app.request(
      `http://localhost${publicBasePath}/api/upload`,
      { method: 'POST' },
    );

    await expect(appHealth.json()).resolves.toEqual(expectedHealth);
    expect(files.status).toBe(403);
    await expect(files.json()).resolves.toEqual({
      error: 'The file access credential is invalid.',
      code: 'INVALID_ACCESS',
    });
    expect(oldUpload.status).toBe(401);
    expect(rootHealth.status).toBe(404);
    expect(bareLocalApi.status).toBe(404);
    await app.close();
  });

  it('mounts standalone WebSocket handlers behind the public base path', async () => {
    const runtime = createStandaloneRuntime();
    const app = trackCloseable(
      await createStandaloneServer({ viteDevUrl: false }),
    );
    const publicBasePath = runtime.config.app.publicBasePath;

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
    const runtime = createStandaloneRuntime();
    const app = trackCloseable(
      await createStandaloneServer({ viteDevUrl: false }),
    );
    const serverUrl = await startStandaloneTestServer(app);
    const websocket = new WebSocket(
      `${serverUrl}${runtime.config.app.publicBasePath}/ws`,
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
    const runtime = createStandaloneRuntime();
    const app = trackCloseable(
      await createStandaloneServer({ viteDevUrl: false }),
    );
    const serverUrl = await startStandaloneTestServer(app);
    const websocket = new WebSocket(
      `${serverUrl}${runtime.config.app.publicBasePath}/ws`,
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
      await createStandaloneServer({ viteDevUrl: false }),
    );

    expect(typeof app.close).toBe('function');
    await expect(app.close()).resolves.toBeUndefined();
    await expect(app.close()).resolves.toBeUndefined();
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
    const runtime = createStandaloneRuntime();
    const app = trackCloseable(await createStandaloneServer({ viteDevUrl }));
    const publicBasePath = runtime.config.app.publicBasePath;
    const requestPath = `${publicBasePath}/settings?tab=apps`;

    const response = await app.request(`http://localhost${requestPath}`, {
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
      nocoBaseApiUrl: false,
      spa: {
        indexPath,
      },
    });

    const response = await app.request('http://localhost/settings');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      'window.NOCOBASE_PORTAL_BASE = "/app-template-default/";',
    );
    expect(html).toContain(
      'window.NOCOBASE_API_URL = "/app-template-default/v2/api";',
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
      nocoBaseApiUrl: false,
      spa: {
        indexPath: path.join(root, 'index.html'),
      },
    });

    const response = await app.request('http://localhost/assets/index.js');

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
      nocoBaseApiUrl: false,
      spa: {
        indexPath: path.join(root, 'index.html'),
      },
    });

    const response = await app.request('http://localhost/assets/missing.js');

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      error: 'Not found',
    });
  });
});

function startStandaloneTestServer(app: StandaloneServer): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = serve(
      {
        fetch: app.fetch,
        hostname: '127.0.0.1',
        port: 0,
      },
      (info) => {
        resolve(`ws://${normalizeListenAddress(info)}:${info.port}`);
      },
    ) as Server;

    server.once('error', reject);
    registerStandaloneWebSocketUpgradeHandler(app, server);
    servers.push(server);
  });
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

function createTestCaching(): CachingConfig {
  return {
    default: 'memory',
    providers: {
      memory: {
        driver: 'memory',
        defaultTtl: '1m',
      },
    },
  };
}

function createTestSession(): AppSessionConfig {
  return {
    enabled: true,
    default: 'memory',
    stores: {
      memory: {
        driver: 'memory',
        base: 'tests:app-session:',
      },
    },
    cookie: {
      name: 'nocobase_session',
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    },
    lifetime: {
      absolute: '2h',
      rolling: true,
    },
    secret: 'test-app-session-secret',
    gcLottery: [0, 100],
  };
}

interface CreateTestAppOptions {
  publicBasePath?: string;
  nocoBaseApiUrl?: string | false;
  database?: DatabaseManager | false;
  caching?: CachingConfig;
  queue?: AppQueueConfig;
  session?: AppSessionConfig;
  pluginBootstraps?: CreateAppOptions['pluginBootstraps'];
  pluginRoutes?: CreateAppOptions['pluginRoutes'];
  spa?: {
    indexPath?: string;
    runtime?: AppConfig['spa']['runtime'];
  };
}

function createTestApp(options: CreateTestAppOptions = {}): TestApp {
  const publicBasePath = normalizeBasePath(
    options.publicBasePath ?? '/app-template-default',
  );
  const internalApiProxyPath = '/v2/api';
  const config = {
    app: {
      name: resolveAppNameFromBasePath(publicBasePath, 'app-template-default'),
      publicBasePath,
      internalBasePath: '',
      internalApiProxyPath,
      publicApiUrl: joinBasePath(publicBasePath, internalApiProxyPath),
      nocoBaseApiUrl:
        options.nocoBaseApiUrl === false ? undefined : options.nocoBaseApiUrl,
    },
    auth: {
      secret: 'test-auth-secret-at-least-32-characters',
      emailAndPassword: {
        enabled: true,
      },
    },
    caching: options.caching ?? createDefaultCachingConfig(),
    database: {
      default: 'main',
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
    files: {
      storage: {
        driver: 'local',
        root: path.resolve(process.cwd(), 'storage/test-files'),
      },
      upload: { maxBytes: 1024, expiresInSeconds: 60 },
      access: {
        temporaryExpiresInSeconds: 60,
        providerUrlExpiresInSeconds: 30,
      },
      publicAccess: { enabled: false },
    },
    plugins: [],
    logging: createSilentLoggingConfig(),
    queue: options.queue ?? createSyncQueueConfig(),
    session: options.session ?? createNullSessionConfig(),
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
    },
  } as AppConfig;
  const runtime: AppRuntime<AppConfig> = {
    config,
    database:
      options.database === false
        ? undefined
        : (options.database ?? createMockDatabase([])),
    runMigrations: () => Promise.resolve(undefined),
    runSeeds: () => Promise.resolve(undefined),
    dispose: () => Promise.resolve(),
  };
  const lifecycle = createAppDisposerRegistry();
  const app = Object.assign(
    createApp(runtime, {
      lifecycle,
      pluginBootstraps: options.pluginBootstraps,
      pluginRoutes: options.pluginRoutes,
    }),
    {
      close: () => lifecycle.disposeAll(),
    },
  );

  return trackCloseable(app);
}

function createEmbeddedTestScope(
  options: Omit<AppScope, 'registerDisposer'>,
  registeredDisposers: RegisteredTestDisposer[] = [],
): AppScope {
  const lifecycle = createAppDisposerRegistry();
  apps.push({
    close: () => lifecycle.disposeAll(),
  });

  return {
    ...options,
    config: options.config ?? {
      authSecret: 'test-auth-secret-at-least-32-characters',
    },
    registerDisposer(name, dispose) {
      registeredDisposers.push({ name, dispose });
      lifecycle.registerDisposer(name, dispose);
    },
  };
}

function trackCloseable<T extends CloseableResource>(resource: T): T {
  apps.push(resource);
  return resource;
}

function firstCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  expect(setCookie).toBeTruthy();
  return setCookie?.split(';')[0] ?? '';
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
