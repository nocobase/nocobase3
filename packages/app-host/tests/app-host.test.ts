import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

import { createAppHost, type AppHost } from '../dist/index.js';

const tempDirs: string[] = [];
const runningHosts: AppHost[] = [];

afterEach(async () => {
  await Promise.all(
    runningHosts.splice(0).map((host) => host.close('test cleanup')),
  );
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

it('dispatches non-asset requests to the embedded server with the app mount stripped', async () => {
  const appsDir = await mkdtemp(path.join(os.tmpdir(), 'nocobase-app-host-'));
  tempDirs.push(appsDir);

  const appRoot = path.join(appsDir, 'customer');
  await mkdir(path.join(appRoot, 'dist', 'client', 'assets'), {
    recursive: true,
  });
  await mkdir(path.join(appRoot, 'dist', 'server'), { recursive: true });
  await writeFile(
    path.join(appRoot, 'package.json'),
    JSON.stringify({
      name: '@example/customer-app',
      version: '1.2.3',
      type: 'module',
    }),
  );
  await writeFile(
    path.join(appRoot, 'dist', 'client', 'index.html'),
    `<!doctype html><html><body><main>Customer App</main><script type="module" src="/assets/app.js"></script></body></html>`,
  );
  await writeFile(
    path.join(appRoot, 'dist', 'client', 'assets', 'app.js'),
    `console.log("customer");`,
  );
  await writeFile(
    path.join(appRoot, 'dist', 'server', 'embedded.js'),
    `
      import { readFile } from "node:fs/promises";
      import path from "node:path";

      export function createServer(scope) {
        return {
          async fetch(request) {
            const url = new URL(request.url);
            if (url.pathname === "/") {
              const html = await readFile(path.join(scope.clientDir, "index.html"), "utf8");
              return new Response(html.replaceAll('"/assets/', '"' + scope.assetsBasePath + "/"), {
                headers: { "content-type": "text/html; charset=utf-8" },
              });
            }

            if (url.pathname === "/redirect") {
              return new Response(null, {
                status: 302,
                headers: { Location: "/install" },
              });
            }

            return Response.json({
              id: scope.id,
              basePath: scope.basePath,
              assetsBasePath: scope.assetsBasePath,
              clientDir: scope.clientDir,
              pathname: url.pathname,
              search: url.search,
            });
          },
        };
      }
    `,
  );

  const host = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
    idleTtlMs: 60_000,
  });
  runningHosts.push(host);
  await host.start();

  const address = host.server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('App host did not expose a TCP address');
  }

  const response = await fetch(
    `http://127.0.0.1:${address.port}/customer/api/hello?x=1`,
  );
  await expect(response.json()).resolves.toMatchObject({
    id: 'customer',
    basePath: '/customer',
    assetsBasePath: '/customer/assets',
    pathname: '/api/hello',
    search: '?x=1',
  });

  const redirect = await fetch(
    `http://127.0.0.1:${address.port}/customer/redirect`,
    { redirect: 'manual' },
  );
  expect(redirect.status).toBe(302);
  expect(redirect.headers.get('location')).toBe('/customer/install');

  const page = await fetch(`http://127.0.0.1:${address.port}/customer/`);
  const pageHtml = await page.text();
  expect(pageHtml).toContain('Customer App');
  expect(pageHtml).toContain('/customer/assets/app.js');

  const asset = await fetch(
    `http://127.0.0.1:${address.port}/customer/assets/app.js`,
  );
  expect(asset.headers.get('cache-control')).toContain('immutable');
  await expect(asset.text()).resolves.toContain('customer');
});

it('includes App-reported runtime resources in the protected control snapshot', async () => {
  const appsDir = await mkdtemp(path.join(os.tmpdir(), 'nocobase-app-host-'));
  tempDirs.push(appsDir);

  const appRoot = path.join(appsDir, 'customer');
  await mkdir(path.join(appRoot, 'dist', 'server'), { recursive: true });
  await writeFile(
    path.join(appRoot, 'package.json'),
    JSON.stringify({
      name: '@example/customer-app',
      version: '1.2.3',
      type: 'module',
    }),
  );
  await writeFile(
    path.join(appRoot, 'dist', 'server', 'embedded.js'),
    `
      export function createServer(scope) {
        scope.reportRuntimeResource({
          id: "database:primary",
          kind: "database",
          name: "Customer 主数据库",
          status: "active",
          provider: "@nocobase/app-database",
          updatedAt: "2026-08-23T12:00:00.000Z",
          details: {
            connectionName: "sqlite",
            dialect: "sqlite",
            driver: "better-sqlite3"
          },
          error: null
        });
        return { fetch: () => Response.json({ ok: true }) };
      }
    `,
  );

  const host = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
    idleTtlMs: 60_000,
  });
  runningHosts.push(host);
  await host.start();

  const address = host.server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('App host did not expose a TCP address');
  }
  await fetch(`http://127.0.0.1:${address.port}/customer/healthz`);
  const response = await fetch(`http://127.0.0.1:${address.port}/__apps`);

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    active: [
      {
        id: 'customer',
        resources: [
          {
            id: 'database:primary',
            name: 'Customer 主数据库',
            status: 'active',
            details: {
              connectionName: 'sqlite',
              dialect: 'sqlite',
              driver: 'better-sqlite3',
            },
          },
        ],
      },
    ],
  });
});

it('does not discover a client-only app without a server artifact', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-client-'),
  );
  tempDirs.push(appsDir);

  const appRoot = path.join(appsDir, 'customer');
  await mkdir(path.join(appRoot, 'dist', 'client', 'assets'), {
    recursive: true,
  });
  await writeFile(
    path.join(appRoot, 'package.json'),
    JSON.stringify({
      name: '@example/customer-app',
      version: '1.2.3',
      type: 'module',
    }),
  );
  await writeFile(
    path.join(appRoot, 'dist', 'client', 'index.html'),
    `<!doctype html><main>Client only</main>`,
  );
  await writeFile(
    path.join(appRoot, 'dist', 'client', 'assets', 'app.js'),
    `console.log("client-only");`,
  );

  const host = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
    idleTtlMs: 60_000,
  });
  runningHosts.push(host);
  await host.start();

  expect(host.registry.listDefinitions()).toEqual([]);

  const address = host.server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('App host did not expose a TCP address');
  }

  const root = await fetch(`http://127.0.0.1:${address.port}/customer/`);
  expect(root.status).toBe(404);
});

it('serves a server-only app from dist/server/embedded.js', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-server-'),
  );
  tempDirs.push(appsDir);

  const appRoot = path.join(appsDir, 'customer');
  await mkdir(path.join(appRoot, 'dist', 'server'), { recursive: true });
  await writeFile(
    path.join(appRoot, 'package.json'),
    JSON.stringify({
      name: '@example/customer-app',
      version: '1.2.3',
      type: 'module',
    }),
  );
  await writeFile(
    path.join(appRoot, 'dist', 'server', 'embedded.js'),
    `
      export function createServer(scope) {
        return {
          fetch(request) {
            const url = new URL(request.url);
            return Response.json({
              id: scope.id,
              basePath: scope.basePath,
              pathname: url.pathname,
            });
          },
        };
      }
    `,
  );

  const host = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
    idleTtlMs: 60_000,
  });
  runningHosts.push(host);
  await host.start();

  const address = host.server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('App host did not expose a TCP address');
  }

  const api = await fetch(`http://127.0.0.1:${address.port}/customer/api/info`);
  await expect(api.json()).resolves.toEqual({
    id: 'customer',
    basePath: '/customer',
    pathname: '/api/info',
  });

  const page = await fetch(
    `http://127.0.0.1:${address.port}/customer/dashboard`,
  );
  await expect(page.json()).resolves.toEqual({
    id: 'customer',
    basePath: '/customer',
    pathname: '/dashboard',
  });
});

it('calls registered app disposers when the app is destroyed', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-disposer-'),
  );
  tempDirs.push(appsDir);

  const appRoot = path.join(appsDir, 'customer');
  await mkdir(path.join(appRoot, 'dist', 'server'), { recursive: true });
  await writeFile(
    path.join(appRoot, 'package.json'),
    JSON.stringify({
      name: '@example/customer-app',
      version: '1.2.3',
      type: 'module',
    }),
  );
  await writeFile(
    path.join(appRoot, 'dist', 'server', 'embedded.js'),
    `
      import { writeFile } from "node:fs/promises";
      import path from "node:path";

      export function createServer(scope) {
        scope.registerDisposer("customer", () => {
          return writeFile(path.join(scope.rootDir, "disposed.txt"), "disposed");
        });

        return {
          fetch() {
            return Response.json({ ok: true });
          }
        };
      }
    `,
  );

  const host = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
    idleTtlMs: 60_000,
  });
  runningHosts.push(host);
  await host.start();

  const address = host.server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('App host did not expose a TCP address');
  }

  const response = await fetch(
    `http://127.0.0.1:${address.port}/customer/api/info`,
  );
  await expect(response.json()).resolves.toEqual({ ok: true });

  await host.close('test disposer');
  await expect(
    readFile(path.join(appRoot, 'disposed.txt'), 'utf8'),
  ).resolves.toBe('disposed');
});

it('keeps serving after a streaming response client disconnects', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-stream-'),
  );
  tempDirs.push(appsDir);

  const appRoot = path.join(appsDir, 'customer');
  await mkdir(path.join(appRoot, 'dist', 'server'), { recursive: true });
  await writeFile(
    path.join(appRoot, 'package.json'),
    JSON.stringify({
      name: '@example/customer-app',
      version: '1.2.3',
      type: 'module',
    }),
  );
  await writeFile(
    path.join(appRoot, 'dist', 'server', 'embedded.js'),
    `
      export function createServer() {
        return {
          fetch() {
            const encoder = new TextEncoder();
            let timer;

            return new Response(new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode("first chunk"));
                timer = setInterval(() => {
                  controller.enqueue(encoder.encode(" next chunk"));
                }, 10);
              },
              cancel() {
                clearInterval(timer);
              },
            }), {
              headers: { "content-type": "text/plain; charset=utf-8" },
            });
          },
        };
      }
    `,
  );

  const host = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
    idleTtlMs: 60_000,
  });
  runningHosts.push(host);
  await host.start();

  const address = host.server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('App host did not expose a TCP address');
  }

  await fetchAndDisconnectAfterFirstChunk(
    new URL(`http://127.0.0.1:${address.port}/customer/stream`),
  );
  await new Promise((resolve) => setTimeout(resolve, 50));

  const health = await fetchJson(
    new URL(`http://127.0.0.1:${address.port}/__health`),
  );
  expect(health.registered).toBe(1);
});

it('reserves /assets for static files and does not fall through to the server', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-assets-'),
  );
  tempDirs.push(appsDir);

  const appRoot = path.join(appsDir, 'customer');
  await mkdir(path.join(appRoot, 'dist', 'client', 'assets'), {
    recursive: true,
  });
  await mkdir(path.join(appRoot, 'dist', 'server'), { recursive: true });
  await writeFile(
    path.join(appRoot, 'package.json'),
    JSON.stringify({
      name: '@example/customer-app',
      version: '1.2.3',
      type: 'module',
    }),
  );
  await writeFile(
    path.join(appRoot, 'dist', 'client', 'assets', 'app.js'),
    `console.log("asset");`,
  );
  await writeFile(
    path.join(appRoot, 'dist', 'server', 'embedded.js'),
    `
      export function createServer() {
        return {
          fetch(request) {
            const url = new URL(request.url);
            return Response.json({ handledByServer: true, pathname: url.pathname });
          },
        };
      }
    `,
  );

  const host = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
    idleTtlMs: 60_000,
  });
  runningHosts.push(host);
  await host.start();

  const address = host.server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('App host did not expose a TCP address');
  }

  const missingAsset = await fetch(
    `http://127.0.0.1:${address.port}/customer/assets/missing.js`,
  );
  expect(missingAsset.status).toBe(404);
  await expect(missingAsset.json()).resolves.toMatchObject({
    error: 'Not found',
  });

  const postAsset = await fetch(
    `http://127.0.0.1:${address.port}/customer/assets/app.js`,
    { method: 'POST' },
  );
  expect(postAsset.status).toBe(405);

  const serverRoute = await fetch(
    `http://127.0.0.1:${address.port}/customer/static/app.js`,
  );
  await expect(serverRoute.json()).resolves.toEqual({
    handledByServer: true,
    pathname: '/static/app.js',
  });
});

it('serves the packaged app-dist fixture', async () => {
  const fixtureAppsDir = fileURLToPath(
    new URL('../fixtures/app-dist', import.meta.url),
  );
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-fixtures-'),
  );
  tempDirs.push(appsDir);
  await Promise.all(
    ['demo', 'lifecycle', 'service', 'ws-demo'].map((appId) =>
      cp(path.join(fixtureAppsDir, appId), path.join(appsDir, appId), {
        recursive: true,
      }),
    ),
  );
  await mkdir(path.join(appsDir, 'orders', 'releases'), { recursive: true });
  await Promise.all(
    ['release-broken', 'release-v1', 'release-v2'].map((releaseId) =>
      cp(
        path.join(fixtureAppsDir, 'orders', 'releases', releaseId),
        path.join(appsDir, 'orders', 'releases', releaseId),
        { recursive: true },
      ),
    ),
  );
  const host = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
    idleTtlMs: 60_000,
  });
  runningHosts.push(host);
  await host.start();

  expect(
    host.registry.listDefinitions().map((definition) => definition.id),
  ).toEqual(
    expect.arrayContaining(['demo', 'lifecycle', 'service', 'ws-demo']),
  );

  const address = host.server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('App host did not expose a TCP address');
  }

  const releasesResponse = await fetch(
    `http://127.0.0.1:${address.port}/__releases`,
  );
  const releases = (await releasesResponse.json()) as {
    releases: Array<{ appId: string; id: string }>;
  };
  const orderReleaseIds = releases.releases
    .filter((release) => release.appId === 'orders')
    .map((release) => release.id)
    .sort();
  expect(orderReleaseIds).toEqual(
    expect.arrayContaining(['release-broken', 'release-v1', 'release-v2']),
  );

  const root = await fetch(`http://127.0.0.1:${address.port}/demo/`);
  const rootHtml = await root.text();
  expect(rootHtml).toContain('Demo App');
  expect(rootHtml).toContain('/demo/assets/demo.js');

  const asset = await fetch(
    `http://127.0.0.1:${address.port}/demo/assets/demo.js`,
  );
  await expect(asset.text()).resolves.toContain('demo fixture');

  const api = await fetch(`http://127.0.0.1:${address.port}/demo/api/info`);
  await expect(api.json()).resolves.toMatchObject({
    id: 'demo',
    basePath: '/demo',
    requestPath: '/api/info',
  });

  const service = await fetch(
    `http://127.0.0.1:${address.port}/service/healthz`,
  );
  await expect(service.json()).resolves.toMatchObject({
    id: 'service',
    requestPath: '/healthz',
  });

  const lifecyclePage = await fetch(
    `http://127.0.0.1:${address.port}/lifecycle/`,
  );
  const lifecycleHtml = await lifecyclePage.text();
  expect(lifecycleHtml).toContain('Lifecycle Demo');
  expect(lifecycleHtml).toContain('/lifecycle/assets/lifecycle.js');

  const lifecycle = await fetch(
    `http://127.0.0.1:${address.port}/lifecycle/api/lifecycle`,
  );
  await expect(lifecycle.json()).resolves.toMatchObject({
    id: 'lifecycle',
    basePath: '/lifecycle',
    assetsBasePath: '/lifecycle/assets',
    beforeDestroyHookRegistered: true,
    beforeDestroyCount: 0,
    disposeCount: 0,
    closed: false,
  });

  const wsDemoPage = await fetch(`http://127.0.0.1:${address.port}/ws-demo/`);
  const wsDemoHtml = await wsDemoPage.text();
  expect(wsDemoHtml).toContain('WebSocket Demo App');
  expect(wsDemoHtml).toContain('/ws-demo/assets/ws-demo.js');
  expect(wsDemoHtml).toContain('id="websocket-url"');
  expect(wsDemoHtml).not.toContain('127.0.0.1:3000');

  const wsDemoAsset = await fetch(
    `http://127.0.0.1:${address.port}/ws-demo/assets/ws-demo.js`,
  );
  const wsDemoAssetText = await wsDemoAsset.text();
  expect(wsDemoAssetText).toContain('ws-demo fixture');
  expect(wsDemoAssetText).toContain('targetUrl.protocol');
  expect(wsDemoAssetText).not.toContain('127.0.0.1:3000');

  const wsDemoInfo = await fetch(
    `http://127.0.0.1:${address.port}/ws-demo/api/info`,
  );
  await expect(wsDemoInfo.json()).resolves.toMatchObject({
    id: 'ws-demo',
    basePath: '/ws-demo',
    requestPath: '/api/info',
    websocket: {
      publicUrl: `ws://127.0.0.1:${address.port}/ws-demo/ws`,
      publicPath: '/ws-demo/ws',
      appLocalPath: '/ws',
      status: 'available',
    },
  });

  const wsDemoHealth = await fetch(
    `http://127.0.0.1:${address.port}/ws-demo/healthz`,
  );
  await expect(wsDemoHealth.json()).resolves.toMatchObject({
    ok: true,
    id: 'ws-demo',
    basePath: '/ws-demo',
    requestPath: '/healthz',
  });

  const wsDemoEndpoint = await fetch(
    `http://127.0.0.1:${address.port}/ws-demo/ws`,
  );
  expect(wsDemoEndpoint.status).toBe(426);
  await expect(wsDemoEndpoint.json()).resolves.toMatchObject({
    error: 'WebSocket upgrade required',
    websocket: {
      publicUrl: `ws://127.0.0.1:${address.port}/ws-demo/ws`,
      appLocalPath: '/ws',
    },
  });

  const wsDemoMessage = await readFirstWebSocketMessage(
    `ws://127.0.0.1:${address.port}/ws-demo/ws`,
  );
  expect(wsDemoMessage).toMatch(/\d{4}/);
});

it('serves health information without discovered apps', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-empty-'),
  );
  tempDirs.push(appsDir);

  const host = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
  });
  runningHosts.push(host);
  await host.start();

  const address = host.server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('App host did not expose a TCP address');
  }

  const response = await fetchJson(
    new URL(`http://127.0.0.1:${address.port}/__health`),
  );
  expect(response.registered).toBe(0);
  expect(response.activeTotal).toBe(0);
});

it('exposes app management through /__apps', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-management-'),
  );
  tempDirs.push(appsDir);

  const host = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
  });
  runningHosts.push(host);
  await host.start();

  const address = host.server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('App host did not expose a TCP address');
  }

  const apps = await fetchJson(
    new URL(`http://127.0.0.1:${address.port}/__apps`),
  );
  expect(apps).toEqual({
    active: [],
    activeReleases: [],
    definitions: [],
    lifecycle: [],
    releases: [],
  });

  const invalidForwardedProtocol = await fetch(
    `http://127.0.0.1:${address.port}/__apps`,
    { headers: { 'x-forwarded-proto': 'javascript' } },
  );
  expect(invalidForwardedProtocol.status).toBe(400);
  await expect(invalidForwardedProtocol.json()).resolves.toMatchObject({
    code: 'APP_HOST_REQUEST_ORIGIN_INVALID',
  });
});

it('rejects a non-HTTP public App Host URL', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-public-url-'),
  );
  tempDirs.push(appsDir);

  expect(() =>
    createAppHost({
      appDistDir: appsDir,
      publicUrl: 'javascript:alert(1)',
    }),
  ).toThrowError(
    expect.objectContaining({ code: 'APP_HOST_PUBLIC_URL_INVALID' }),
  );
});

it('deploys immutable releases, rejects an unhealthy candidate, and rolls back', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-releases-'),
  );
  tempDirs.push(appsDir);

  await writeManagedRelease(
    appsDir,
    'orders',
    'release-v1',
    '1.0.0',
    'v1',
    200,
  );
  await writeManagedRelease(
    appsDir,
    'orders',
    'release-v2',
    '1.1.0',
    'v2',
    200,
  );
  await writeManagedRelease(
    appsDir,
    'orders',
    'release-broken',
    '1.2.0',
    'broken',
    503,
  );

  const host = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
    publicUrl: 'https://apps.example.com/runtime/',
  });
  runningHosts.push(host);
  await host.start();

  const address = host.server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('App host did not expose a TCP address');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const releasesResponse = await fetch(`${baseUrl}/__apps/orders/releases`);
  expect(releasesResponse.status).toBe(200);
  const releases = (await releasesResponse.json()) as {
    releases: Array<{ id: string }>;
  };
  expect(releases.releases.map((release) => release.id).sort()).toEqual([
    'release-broken',
    'release-v1',
    'release-v2',
  ]);

  const firstDeployment = await postJson(`${baseUrl}/__apps/orders/deploy`, {
    releaseId: 'release-v1',
  });
  expect(firstDeployment.response.status).toBe(200);
  expect(firstDeployment.body.deployment).toMatchObject({
    activeReleaseId: 'release-v1',
    activeVersion: '1.0.0',
    changed: true,
  });
  const managedApps = await fetchJson(new URL(`${baseUrl}/__apps`));
  expect(managedApps.active).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'orders',
        basePath: '/orders',
        accessUrl: 'https://apps.example.com/runtime/orders/',
      }),
    ]),
  );
  await expect(
    fetch(`${baseUrl}/orders/version`).then((response) => response.json()),
  ).resolves.toMatchObject({
    label: 'v1',
    releaseId: 'release-v1',
  });

  const persistedState = await readFile(
    host.releaseStateStore.stateFile,
    'utf8',
  );
  await writeFile(host.releaseStateStore.stateFile, 'not-json', 'utf8');
  const stateWriteFailure = await postJson(`${baseUrl}/__apps/orders/deploy`, {
    releaseId: 'release-v2',
  });
  expect(stateWriteFailure.response.status).toBe(500);
  await expect(
    fetch(`${baseUrl}/orders/version`).then((response) => response.json()),
  ).resolves.toMatchObject({
    label: 'v1',
    releaseId: 'release-v1',
  });
  await writeFile(host.releaseStateStore.stateFile, persistedState, 'utf8');

  const repeatedDeployment = await postJson(`${baseUrl}/__apps/orders/deploy`, {
    releaseId: 'release-v1',
  });
  expect(repeatedDeployment.response.status).toBe(200);
  expect(repeatedDeployment.body.deployment).toMatchObject({
    activeReleaseId: 'release-v1',
    changed: false,
  });
  expect(
    (repeatedDeployment.body.deployment as { app: { version: number } }).app
      .version,
  ).toBe(
    (firstDeployment.body.deployment as { app: { version: number } }).app
      .version,
  );

  const eviction = await postJson(`${baseUrl}/__apps/orders/evict`, {});
  expect(eviction.response.status).toBe(200);
  const idleManagedApps = await fetchJson(new URL(`${baseUrl}/__apps`));
  expect(idleManagedApps.active).toEqual([]);
  expect(idleManagedApps.activeReleases).toEqual([
    expect.objectContaining({
      appId: 'orders',
      releaseId: 'release-v1',
    }),
  ]);

  const idleRepeatedDeployment = await postJson(
    `${baseUrl}/__apps/orders/deploy`,
    { releaseId: 'release-v1' },
  );
  expect(idleRepeatedDeployment.response.status).toBe(200);
  expect(idleRepeatedDeployment.body.deployment).toMatchObject({
    previousReleaseId: 'release-v1',
    activeReleaseId: 'release-v1',
    changed: false,
  });

  const activeEntrypoint = path.join(
    appsDir,
    'orders',
    'releases',
    'release-v1',
    'dist',
    'server',
    'embedded.js',
  );
  await writeFile(
    activeEntrypoint,
    `${await readFile(activeEntrypoint, 'utf8')}\n// tampered\n`,
  );
  const tamperedArtifactDeployment = await postJson(
    `${baseUrl}/__apps/orders/deploy`,
    {
      releaseId: 'release-v1',
    },
  );
  expect(tamperedArtifactDeployment.response.status).toBe(409);
  expect(tamperedArtifactDeployment.body).toMatchObject({
    code: 'APP_RELEASE_INTEGRITY_FAILED',
  });
  await expect(
    fetch(`${baseUrl}/orders/version`).then((response) => response.json()),
  ).resolves.toMatchObject({
    label: 'v1',
    releaseId: 'release-v1',
  });
  await writeManagedRelease(
    appsDir,
    'orders',
    'release-v1',
    '1.0.0',
    'v1',
    200,
  );

  await writeManagedRelease(
    appsDir,
    'orders',
    'release-v1',
    '9.9.9',
    'tampered',
    200,
  );
  const conflictingDeployment = await postJson(
    `${baseUrl}/__apps/orders/deploy`,
    { releaseId: 'release-v1' },
  );
  expect(conflictingDeployment.response.status).toBe(409);
  expect(conflictingDeployment.body).toMatchObject({
    code: 'APP_RELEASE_CONFLICT',
  });
  await expect(
    fetch(`${baseUrl}/orders/version`).then((response) => response.json()),
  ).resolves.toMatchObject({
    label: 'v1',
    releaseId: 'release-v1',
  });
  await writeManagedRelease(
    appsDir,
    'orders',
    'release-v1',
    '1.0.0',
    'v1',
    200,
  );

  const secondDeployment = await postJson(`${baseUrl}/__apps/orders/deploy`, {
    releaseId: 'release-v2',
  });
  expect(secondDeployment.response.status).toBe(200);
  expect(secondDeployment.body.deployment).toMatchObject({
    previousReleaseId: 'release-v1',
    activeReleaseId: 'release-v2',
    changed: true,
  });

  const brokenDeployment = await postJson(`${baseUrl}/__apps/orders/deploy`, {
    releaseId: 'release-broken',
    waitForReady: false,
  });
  expect(brokenDeployment.response.status).toBe(422);
  expect(brokenDeployment.body).toMatchObject({ code: 'APP_READINESS_FAILED' });
  await expect(
    fetch(`${baseUrl}/orders/version`).then((response) => response.json()),
  ).resolves.toMatchObject({
    label: 'v2',
    releaseId: 'release-v2',
  });

  const rollback = await postJson(`${baseUrl}/__apps/orders/rollback`, {
    releaseId: 'release-v1',
  });
  expect(rollback.response.status).toBe(200);
  expect(rollback.body.deployment).toMatchObject({
    previousReleaseId: 'release-v2',
    activeReleaseId: 'release-v1',
    changed: true,
  });
  await expect(
    fetch(`${baseUrl}/orders/version`).then((response) => response.json()),
  ).resolves.toMatchObject({
    label: 'v1',
    releaseId: 'release-v1',
  });
});

it('persists a stopped app, blocks cold activation, and starts the same release again', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-lifecycle-'),
  );
  tempDirs.push(appsDir);
  await writeManagedRelease(
    appsDir,
    'orders',
    'release-v1',
    '1.0.0',
    'v1',
    200,
  );

  const firstHost = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
  });
  runningHosts.push(firstHost);
  await firstHost.start();
  const firstAddress = firstHost.server.address();
  if (!firstAddress || typeof firstAddress !== 'object') {
    throw new Error('App host did not expose a TCP address');
  }
  const firstBaseUrl = `http://127.0.0.1:${firstAddress.port}`;
  await postJson(`${firstBaseUrl}/__apps/orders/deploy`, {
    releaseId: 'release-v1',
  });

  const stopped = await postJson(`${firstBaseUrl}/__apps/orders/stop`, {});
  expect(stopped.response.status).toBe(200);
  expect(stopped.body.lifecycle).toMatchObject({
    action: 'stop',
    changed: true,
    desiredState: 'stopped',
    runtimeState: 'stopped',
  });
  const repeatedStop = await postJson(`${firstBaseUrl}/__apps/orders/stop`, {});
  expect(repeatedStop.body.lifecycle).toMatchObject({ changed: false });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const blocked = await fetch(`${firstBaseUrl}/orders/version`);
    expect(blocked.status).toBe(503);
    await expect(blocked.json()).resolves.toMatchObject({
      code: 'APP_STOPPED',
    });
  }
  expect(firstHost.registry.isActive('orders')).toBe(false);
  await firstHost.close('test app host restart');

  const restoredHost = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
  });
  runningHosts.push(restoredHost);
  await restoredHost.start();
  const restoredAddress = restoredHost.server.address();
  if (!restoredAddress || typeof restoredAddress !== 'object') {
    throw new Error('Restored app host did not expose a TCP address');
  }
  const restoredBaseUrl = `http://127.0.0.1:${restoredAddress.port}`;
  expect(restoredHost.registry.isActive('orders')).toBe(false);
  const stillBlocked = await fetch(`${restoredBaseUrl}/orders/version`);
  expect(stillBlocked.status).toBe(503);

  const started = await postJson(`${restoredBaseUrl}/__apps/orders/start`, {});
  expect(started.response.status).toBe(200);
  expect(started.body.lifecycle).toMatchObject({
    action: 'start',
    changed: true,
    desiredState: 'running',
    runtimeState: 'active',
    app: { releaseId: 'release-v1' },
  });
  await expect(
    fetch(`${restoredBaseUrl}/orders/version`).then((response) =>
      response.json(),
    ),
  ).resolves.toMatchObject({ label: 'v1', releaseId: 'release-v1' });
  const repeatedStart = await postJson(
    `${restoredBaseUrl}/__apps/orders/start`,
    {},
  );
  expect(repeatedStart.body.lifecycle).toMatchObject({ changed: false });
});

it('restores the last promoted release after restart and rejects replaced release content', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-release-restore-'),
  );
  tempDirs.push(appsDir);

  await writeManagedRelease(
    appsDir,
    'orders',
    'release-v1',
    '1.0.0',
    'v1',
    200,
  );
  await writeManagedRelease(
    appsDir,
    'orders',
    'release-v2',
    '1.1.0',
    'v2',
    200,
  );
  await writeManagedRelease(
    appsDir,
    'orders',
    'release-broken',
    '1.2.0',
    'broken',
    503,
  );

  const firstHost = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
  });
  runningHosts.push(firstHost);
  await firstHost.start();
  const firstAddress = firstHost.server.address();
  if (!firstAddress || typeof firstAddress !== 'object') {
    throw new Error('App host did not expose a TCP address');
  }
  const firstBaseUrl = `http://127.0.0.1:${firstAddress.port}`;
  expect(
    (
      await postJson(`${firstBaseUrl}/__apps/orders/deploy`, {
        releaseId: 'release-v1',
      })
    ).response.status,
  ).toBe(200);
  await rm(firstHost.releaseStateStore.stateFile);
  const repeatedDeployment = await postJson(
    `${firstBaseUrl}/__apps/orders/deploy`,
    { releaseId: 'release-v1' },
  );
  expect(repeatedDeployment.response.status).toBe(200);
  expect(repeatedDeployment.body.deployment).toMatchObject({
    activeReleaseId: 'release-v1',
    changed: false,
  });
  await expect(firstHost.releaseStateStore.read()).resolves.toMatchObject({
    releases: [{ appId: 'orders', releaseId: 'release-v1' }],
  });
  await firstHost.close('restart test');

  const secondHost = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
  });
  runningHosts.push(secondHost);
  await secondHost.start();
  const secondAddress = secondHost.server.address();
  if (!secondAddress || typeof secondAddress !== 'object') {
    throw new Error('Restored app host did not expose a TCP address');
  }
  const secondBaseUrl = `http://127.0.0.1:${secondAddress.port}`;
  await expect(
    fetch(`${secondBaseUrl}/orders/version`).then((response) =>
      response.json(),
    ),
  ).resolves.toMatchObject({
    label: 'v1',
    releaseId: 'release-v1',
  });

  expect(
    (
      await postJson(`${secondBaseUrl}/__apps/orders/deploy`, {
        releaseId: 'release-v2',
      })
    ).response.status,
  ).toBe(200);
  const brokenDeployment = await postJson(
    `${secondBaseUrl}/__apps/orders/deploy`,
    {
      releaseId: 'release-broken',
    },
  );
  expect(brokenDeployment.response.status).toBe(422);
  await secondHost.close('restart after rejected candidate');

  const thirdHost = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
  });
  runningHosts.push(thirdHost);
  await thirdHost.start();
  const thirdAddress = thirdHost.server.address();
  if (!thirdAddress || typeof thirdAddress !== 'object') {
    throw new Error('Restored app host did not expose a TCP address');
  }
  const thirdBaseUrl = `http://127.0.0.1:${thirdAddress.port}`;
  await expect(
    fetch(`${thirdBaseUrl}/orders/version`).then((response) => response.json()),
  ).resolves.toMatchObject({
    label: 'v2',
    releaseId: 'release-v2',
  });
  expect(
    (
      await postJson(`${thirdBaseUrl}/__apps/orders/rollback`, {
        releaseId: 'release-v1',
      })
    ).response.status,
  ).toBe(200);
  await thirdHost.close('restart after rollback');

  const fourthHost = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
  });
  runningHosts.push(fourthHost);
  await fourthHost.start();
  const fourthAddress = fourthHost.server.address();
  if (!fourthAddress || typeof fourthAddress !== 'object') {
    throw new Error('Restored app host did not expose a TCP address');
  }
  const fourthBaseUrl = `http://127.0.0.1:${fourthAddress.port}`;
  await expect(
    fetch(`${fourthBaseUrl}/orders/version`).then((response) =>
      response.json(),
    ),
  ).resolves.toMatchObject({
    label: 'v1',
    releaseId: 'release-v1',
  });
  await fourthHost.close('tamper persisted release');

  await writeManagedRelease(
    appsDir,
    'orders',
    'release-v1',
    '9.9.9',
    'replacement',
    200,
  );
  const rejectedHost = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
  });
  runningHosts.push(rejectedHost);
  await expect(rejectedHost.start()).rejects.toMatchObject({
    code: 'APP_RELEASE_INTEGRITY_FAILED',
  });
  expect(rejectedHost.server.address()).toBeNull();
});

it('protects control routes when a control token is configured', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-auth-'),
  );
  tempDirs.push(appsDir);

  const host = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
    controlToken: 'test-control-token',
  });
  runningHosts.push(host);
  await host.start();

  const address = host.server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('App host did not expose a TCP address');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const unauthorized = await fetch(`${baseUrl}/__apps`);
  expect(unauthorized.status).toBe(401);
  await expect(unauthorized.json()).resolves.toMatchObject({
    code: 'APP_HOST_UNAUTHORIZED',
  });

  const authorized = await fetch(`${baseUrl}/__apps`, {
    headers: {
      authorization: 'Bearer test-control-token',
    },
  });
  expect(authorized.status).toBe(200);
});

async function writeManagedRelease(
  appsDir: string,
  appId: string,
  releaseId: string,
  version: string,
  label: string,
  healthStatus: number,
): Promise<void> {
  const releaseRoot = path.join(appsDir, appId, 'releases', releaseId);
  await mkdir(path.join(releaseRoot, 'dist', 'server'), { recursive: true });
  const embeddedSource = `
      export function createServer(scope) {
        return {
          fetch(request) {
            const url = new URL(request.url);
            if (url.pathname === "/healthz") {
              return Response.json({ ok: ${healthStatus < 400} }, { status: ${healthStatus} });
            }
            return Response.json({
              label: ${JSON.stringify(label)},
              version: ${JSON.stringify(version)},
              releaseId: scope.releaseId,
            });
          },
        };
      }
    `;
  await writeFile(
    path.join(releaseRoot, 'dist', 'server', 'embedded.js'),
    embeddedSource,
  );
  await writeFile(
    path.join(releaseRoot, 'app-release.json'),
    JSON.stringify({
      schemaVersion: 1,
      appId,
      releaseId,
      version,
      artifactSha256: hashArtifact('server/embedded.js', embeddedSource),
      createdAt: new Date().toISOString(),
      runtime: {
        healthPath: '/healthz',
      },
    }),
  );
  await writeFile(
    path.join(releaseRoot, 'package.json'),
    JSON.stringify({
      name: `@example/${appId}`,
      version,
      type: 'module',
    }),
  );
}

function hashArtifact(relativePath: string, content: string): string {
  const hash = createHash('sha256');
  hash.update(relativePath);
  hash.update('\0');
  hash.update(content);
  hash.update('\0');
  return hash.digest('hex');
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
): Promise<{ response: Response; body: Record<string, unknown> }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return {
    response,
    body: (await response.json()) as Record<string, unknown>,
  };
}

function fetchJson(url: URL): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on('end', () => {
          try {
            resolve(
              JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
                string,
                unknown
              >,
            );
          } catch (error) {
            reject(error);
          }
        });
      })
      .once('error', reject);
  });
}

function readFirstWebSocketMessage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out waiting for WebSocket message from ${url}`));
    }, 2_000);

    socket.addEventListener(
      'message',
      (event) => {
        clearTimeout(timeout);
        socket.close();
        resolve(
          typeof event.data === 'string' ? event.data : String(event.data),
        );
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket connection failed for ${url}`));
      },
      { once: true },
    );
  });
}

function fetchAndDisconnectAfterFirstChunk(url: URL): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = http
      .get(url, (response) => {
        response.once('data', () => {
          settled = true;
          request.destroy();
          resolve();
        });
      })
      .once('error', (error: NodeJS.ErrnoException) => {
        if (!settled) {
          reject(error);
        }
      });
  });
}
