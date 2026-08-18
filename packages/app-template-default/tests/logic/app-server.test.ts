// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import type { AppCacheConfig } from '@nocobase/cache';
import type { DatabaseManager, QueryAdapter } from '@nocobase/database';
import type { AppDriveConfig } from '@nocobase/drive';
import type { AppSessionConfig } from '@nocobase/session';

import {
  createApp,
  createServer as createEmbeddedServer,
  createStandaloneRuntime,
  createStandaloneServer,
  queueDemoExecutions,
} from '../../server/index.ts';

const servers: Server[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
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
    const app = await createEmbeddedServer({
      id: 'app-template-default',
      basePath: '/embedded-app-template-default',
    });

    const response = await app.request('http://localhost/api/healthz');

    await expect(response.json()).resolves.toEqual({
      ok: true,
      app: {
        name: 'app-template-default',
        basePath: '/embedded-app-template-default',
      },
      basePath: '/embedded-app-template-default',
    });
  });

  it('returns a closable embedded app and registers the same close handler with the scope', async () => {
    const registeredDisposers: Array<{
      name: string;
      dispose: () => void | Promise<void>;
    }> = [];
    const app = await createEmbeddedServer({
      id: 'app-template-default',
      basePath: '/embedded-app-template-default',
      registerDisposer(name, dispose) {
        registeredDisposers.push({ name, dispose });
      },
    });

    expect(typeof app.close).toBe('function');
    expect(registeredDisposers).toEqual([
      {
        name: 'app',
        dispose: app.close,
      },
    ]);

    await expect(app.close()).resolves.toBeUndefined();
    await expect(app.close()).resolves.toBeUndefined();
    await expect(registeredDisposers[0].dispose()).resolves.toBeUndefined();
  });

  it('serves embedded production SPA routes from the stripped app-host path', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-app-template-default-embedded-client-'));
    tempDirs.push(root);
    writeFileSync(
      path.join(root, 'index.html'),
      '<div id="root"></div><script type="module" src="/app-template-default/assets/index.js"></script>',
    );

    const app = await createEmbeddedServer({
      id: 'app-template-default',
      basePath: '/app-template-default',
      clientDir: root,
    });

    const response = await app.request('http://localhost/');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('window.NOCOBASE_PORTAL_BASE = "/app-template-default/";');
    expect(html).toContain('window.NOCOBASE_API_URL = "/app-template-default/v2/api";');
  });

  it('reads embedded runtime config from dist/.env without using process.env', async () => {
    const nocoBaseApiUrl = await startHttpStub((_request, response) => {
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          url: _request.url,
          forwardedPrefix: _request.headers['x-forwarded-prefix'],
        }),
      );
    });
    const appRoot = mkdtempSync(path.join(tmpdir(), 'nocobase-app-template-default-embedded-root-'));
    tempDirs.push(appRoot);
    const clientDir = path.join(appRoot, 'dist', 'client');
    mkdirSync(clientDir, { recursive: true });
    writeFileSync(
      path.join(appRoot, 'dist', '.env'),
      [
        `NOCOBASE_API_PROXY_TARGET=${nocoBaseApiUrl}/nocobase/api/`,
        'API_CLIENT_STORAGE_PREFIX=EMBEDDED_',
        'API_CLIENT_STORAGE_TYPE=sessionStorage',
        'API_CLIENT_SHARE_TOKEN=true',
      ].join('\n'),
    );
    writeFileSync(path.join(clientDir, 'index.html'), '<script type="module" src="/app-template-default/assets/index.js"></script>');

    const app = await createEmbeddedServer({
      id: 'app-template-default',
      basePath: '/app-template-default',
      rootDir: appRoot,
      clientDir,
    });

    const api = await app.request('http://localhost/v2/api/oidc:checkRedirect?redirect=%2Fapp-template-default%2F');
    await expect(api.json()).resolves.toEqual({
      url: '/nocobase/api/oidc:checkRedirect?redirect=%2Fapp-template-default%2F',
      forwardedPrefix: '/v2/api',
    });

    const page = await app.request('http://localhost/');
    const html = await page.text();
    expect(html).toContain('window.__nocobase_api_client_storage_prefix__ = "EMBEDDED_";');
    expect(html).toContain('window.__nocobase_api_client_storage_type__ = "sessionStorage";');
    expect(html).toContain('window.__nocobase_api_client_share_token__ = true;');
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
    const app = createApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: `${nocoBaseApiUrl}/nocobase/api/`,
    });

    const response = await app.request('http://localhost/v2/api/systemSettings:get?locale=zh-CN', {
      headers: {
        host: '127.0.0.1:13000',
        origin: 'http://127.0.0.1:13000',
        referer: 'http://127.0.0.1:13000/app-template-default/login',
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      method: 'GET',
      url: '/nocobase/api/systemSettings:get?locale=zh-CN',
      host: new URL(nocoBaseApiUrl).host,
      origin: nocoBaseApiUrl,
      referer: `${nocoBaseApiUrl}/nocobase/app-template-default/login`,
      forwardedHost: '127.0.0.1:13000',
      forwardedPrefix: '/v2/api',
      forwardedProto: 'http',
    });
  });

  it('returns a JSON error when the API proxy target is not configured', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-app-template-default-client-'));
    tempDirs.push(root);
    writeFileSync(path.join(root, 'index.html'), '<main>app-template-default app</main>');

    const app = createApp({
      publicBasePath: '/app-template-default',
      spa: {
        indexPath: path.join(root, 'index.html'),
      },
    });

    const response = await app.request('http://localhost/v2/api/oidc:checkRedirect?redirect=%2Fapp-template-default%2F');

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      error: 'NocoBase API proxy target is not configured.',
    });
  });

  it('returns a JSON error when app settings are requested without a database', async () => {
    const app = createApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: false,
    });

    const response = await app.request('http://localhost/api/app-settings');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Database is not configured.',
    });
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
    const app = createApp({
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
    const app = createApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: false,
      cache: createTestCache(),
    });

    const firstResponse = await app.request('http://localhost/api/cache/demo');
    const firstPayload = await firstResponse.json();
    const secondResponse = await app.request('http://localhost/api/cache/demo');
    const secondPayload = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstPayload).toMatchObject({
      key: 'examples:cache:demo',
      ttl: '30s',
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

    const deleteResponse = await app.request('http://localhost/api/cache/demo', {
      method: 'DELETE',
    });

    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({
      key: 'examples:cache:demo',
      deleted: true,
    });

    const thirdResponse = await app.request('http://localhost/api/cache/demo');
    const thirdPayload = await thirdResponse.json();

    expect(thirdResponse.status).toBe(200);
    expect(thirdPayload.cached).toBe(false);
    expect(thirdPayload.value.id).not.toBe(firstPayload.value.id);
  });

  it('serves a session API example with cookie-backed persistence', async () => {
    const app = createApp({
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

    const touchResponse = await app.request('http://localhost/api/session/touch', {
      method: 'POST',
    });
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

    const secondTouchResponse = await app.request('http://localhost/api/session/touch', {
      method: 'POST',
      headers: {
        cookie,
      },
    });
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

  it('serves a queue API example with the sync connection', async () => {
    queueDemoExecutions.length = 0;
    const app = createApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: false,
      queue: {
        default: 'sync',
        connections: {
          sync: {
            driver: 'sync',
          },
        },
        jobs: {
          locations: [],
          autoLoad: false,
        },
      },
    });

    const response = await app.request('http://localhost/api/queue/demo', {
      method: 'POST',
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      jobId: expect.any(String),
      job: 'QueueDemo',
      queue: 'default',
      syncExecutions: 1,
    });
    expect(queueDemoExecutions).toHaveLength(1);
    expect(queueDemoExecutions[0]).toMatchObject({
      message: 'Hello from NocoBase queue',
      requestedAt: expect.any(String),
      executedAt: expect.any(String),
    });

    await app.close();
  });

  it('writes a queue demo database log when database is configured', async () => {
    queueDemoExecutions.length = 0;
    const insertedRows: unknown[] = [];
    const app = createApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: false,
      database: createMockDatabase([], insertedRows),
      queue: {
        default: 'sync',
        connections: {
          sync: {
            driver: 'sync',
          },
        },
        jobs: {
          locations: [],
          autoLoad: false,
        },
      },
    });

    const response = await app.request('http://localhost/api/queue/demo', {
      method: 'POST',
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      jobId: expect.any(String),
      job: 'QueueDemo',
      queue: 'default',
      syncExecutions: 1,
    });
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      key: `queue.demo.${payload.jobId}`,
      value: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const value = JSON.parse((insertedRows[0] as { value: string }).value) as Record<string, unknown>;
    expect(value).toMatchObject({
      message: 'Hello from NocoBase queue',
      requestedAt: expect.any(String),
      executedAt: expect.any(String),
    });

    await app.close();
  });

  it('returns a JSON error when upload is requested without file drive', async () => {
    const app = createApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: false,
    });
    const body = new FormData();
    body.set('file', new File(['Hello world'], 'hello.txt', { type: 'text/plain' }));

    const response = await app.request('http://localhost/api/upload', {
      method: 'POST',
      body,
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'File drive is not configured.',
    });
  });

  it('requires a file for uploads', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-app-template-default-upload-'));
    tempDirs.push(root);
    const app = createApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: false,
      drive: createTestDrive(root),
    });
    const body = new FormData();
    body.set('file', 'not-a-file');

    const response = await app.request('http://localhost/api/upload', {
      method: 'POST',
      body,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'File is required',
    });
  });

  it('uploads files with the configured file drive', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-app-template-default-upload-'));
    tempDirs.push(root);
    const app = createApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: false,
      drive: createTestDrive(root),
    });
    const body = new FormData();
    body.set('file', new File(['Hello world'], 'hello world.txt', { type: 'text/plain' }));

    const response = await app.request('http://localhost/api/upload', {
      method: 'POST',
      body,
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      name: 'hello world.txt',
      size: 11,
      type: 'text/plain',
    });
    expect(payload.key).toMatch(/^uploads\/[0-9a-f-]+-hello-world\.txt$/);
    expect(payload.url).toBe(`/storage/${payload.key}`);
    expect(readFileSync(path.join(root, 'storage/app/public', payload.key), 'utf8')).toBe('Hello world');
  });

  it('strips compressed upstream response headers before returning proxied API responses', async () => {
    const payload = JSON.stringify({ ok: true });
    const compressedPayload = gzipSync(payload);
    const nocoBaseApiUrl = await startHttpStub((_request, response) => {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('content-encoding', 'gzip');
      response.setHeader('content-length', String(compressedPayload.byteLength));
      response.end(compressedPayload);
    });
    const app = createApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: `${nocoBaseApiUrl}/nocobase/api/`,
    });

    const response = await app.request('http://localhost/v2/api/systemSettings:get');

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
    const app = createStandaloneServer({ viteDevUrl });
    const publicBasePath = runtime.config.app.publicBasePath;

    const response = await app.request(`http://localhost${publicBasePath}/api/healthz`);

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

  it('mounts standalone app-local routes behind the public base path', async () => {
    const runtime = createStandaloneRuntime();
    const app = createStandaloneServer({ viteDevUrl: false });
    const publicBasePath = runtime.config.app.publicBasePath;
    const expectedHealth = {
      ok: true,
      app: {
        name: runtime.config.app.name,
        basePath: publicBasePath,
      },
    };

    const rootHealth = await app.request('http://localhost/healthz');
    const appHealth = await app.request(`http://localhost${publicBasePath}/healthz`);
    const bareLocalApi = await app.request('http://localhost/api/healthz');

    await expect(rootHealth.json()).resolves.toEqual(expectedHealth);
    await expect(appHealth.json()).resolves.toEqual(expectedHealth);
    expect(bareLocalApi.status).toBe(404);
    await app.close();
  });

  it('returns a closable standalone app', async () => {
    const app = createStandaloneServer({ viteDevUrl: false });

    expect(typeof app.close).toBe('function');
    await expect(app.close()).resolves.toBeUndefined();
    await expect(app.close()).resolves.toBeUndefined();
  });

  it('proxies standalone SPA routes to Vite dev server with the public base path restored', async () => {
    const viteDevUrl = await startHttpStub((_request, response) => {
      response.setHeader('content-type', 'text/plain; charset=utf-8');
      response.end(`vite:${_request.method}:${_request.url}`);
    });
    const runtime = createStandaloneRuntime();
    const app = createStandaloneServer({ viteDevUrl });
    const publicBasePath = runtime.config.app.publicBasePath;
    const requestPath = `${publicBasePath}/settings?tab=apps`;

    const response = await app.request(`http://localhost${requestPath}`);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(`vite:GET:${requestPath}`);
    await app.close();
  });

  it('injects browser runtime config when serving the production SPA index', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-app-template-default-client-'));
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

    const app = createApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: false,
      spa: {
        indexPath,
      },
    });

    const response = await app.request('http://localhost/settings');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('window.NOCOBASE_PORTAL_BASE = "/app-template-default/";');
    expect(html).toContain('window.NOCOBASE_API_URL = "/app-template-default/v2/api";');
    expect(html.indexOf('window.NOCOBASE_PORTAL_BASE')).toBeLessThan(html.indexOf('<script type="module"'));
  });

  it('serves production SPA assets before the SPA fallback', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-app-template-default-client-'));
    tempDirs.push(root);
    mkdirSync(path.join(root, 'assets'));
    writeFileSync(path.join(root, 'index.html'), '<script type="module" src="/app-template-default/assets/index.js"></script>');
    writeFileSync(path.join(root, 'assets/index.js'), 'console.log("app-template-default asset");');

    const app = createApp({
      publicBasePath: '/app-template-default',
      nocoBaseApiUrl: false,
      spa: {
        indexPath: path.join(root, 'index.html'),
      },
    });

    const response = await app.request('http://localhost/assets/index.js');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    await expect(response.text()).resolves.toBe('console.log("app-template-default asset");');
  });

  it('does not return the SPA index for missing production SPA assets', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-app-template-default-client-'));
    tempDirs.push(root);
    mkdirSync(path.join(root, 'assets'));
    writeFileSync(path.join(root, 'index.html'), '<main>app-template-default app</main>');

    const app = createApp({
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

function createTestDrive(root: string): AppDriveConfig {
  return {
    default: 'public',
    disks: {
      public: {
        driver: 'fs',
        location: path.join(root, 'storage/app/public'),
        visibility: 'public',
        url: '/storage',
      },
    },
    links: {
      [path.join(root, 'public/storage')]: path.join(root, 'storage/app/public'),
    },
  };
}

function createTestCache(): AppCacheConfig {
  return {
    default: 'memory',
    stores: {
      memory: {
        driver: 'memory',
        ttl: '1m',
        namespace: 'tests',
      },
      null: {
        driver: 'null',
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

function firstCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  expect(setCookie).toBeTruthy();
  return setCookie?.split(';')[0] ?? '';
}

function createMockDatabase(rows: unknown[], insertedRows: unknown[] = []): DatabaseManager {
  return {
    connection: (() => {
      throw new Error('Not implemented.');
    }) as DatabaseManager['connection'],
    builder: (() => {
      throw new Error('Not implemented.');
    }) as DatabaseManager['builder'],
    query: (() => createMockQuery(rows, insertedRows)) as DatabaseManager['query'],
    connect: (() => Promise.reject(new Error('Not implemented.'))) as DatabaseManager['connect'],
    transaction: (() => Promise.reject(new Error('Not implemented.'))) as DatabaseManager['transaction'],
    disconnect: (() => Promise.resolve()) as DatabaseManager['disconnect'],
    reconnect: (() => Promise.reject(new Error('Not implemented.'))) as DatabaseManager['reconnect'],
    destroy: (() => Promise.resolve()) as DatabaseManager['destroy'],
  };
}

function createMockQuery(rows: unknown[], insertedRows: unknown[]): QueryAdapter {
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
