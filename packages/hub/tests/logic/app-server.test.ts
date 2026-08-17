// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import {
  createApp,
  createServer as createEmbeddedServer,
  createStandaloneServer,
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
      id: 'hub',
      basePath: '/embedded-hub',
    });

    const response = await app.request('http://localhost/api/healthz');

    await expect(response.json()).resolves.toEqual({
      ok: true,
      app: {
        name: 'hub',
        basePath: '/embedded-hub',
      },
      basePath: '/embedded-hub',
    });
  });

  it('serves embedded production client routes from the stripped app-host path', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-hub-embedded-client-'));
    tempDirs.push(root);
    writeFileSync(
      path.join(root, 'index.html'),
      '<div id="root"></div><script type="module" src="/hub/assets/index.js"></script>',
    );

    const app = await createEmbeddedServer({
      id: 'hub',
      basePath: '/hub',
      clientDir: root,
    });

    const response = await app.request('http://localhost/');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('window.NOCOBASE_PORTAL_BASE = "/hub/";');
    expect(html).toContain('window.NOCOBASE_API_URL = "/hub/v2/api";');
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
    const appRoot = mkdtempSync(path.join(tmpdir(), 'nocobase-hub-embedded-root-'));
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
    writeFileSync(path.join(clientDir, 'index.html'), '<script type="module" src="/hub/assets/index.js"></script>');

    const app = await createEmbeddedServer({
      id: 'hub',
      basePath: '/hub',
      rootDir: appRoot,
      clientDir,
    });

    const api = await app.request('http://localhost/v2/api/oidc:checkRedirect?redirect=%2Fhub%2F');
    await expect(api.json()).resolves.toEqual({
      url: '/nocobase/api/oidc:checkRedirect?redirect=%2Fhub%2F',
      forwardedPrefix: '/v2/api',
    });

    const page = await app.request('http://localhost/');
    const html = await page.text();
    expect(html).toContain('window.__nocobase_api_client_storage_prefix__ = "EMBEDDED_";');
    expect(html).toContain('window.__nocobase_api_client_storage_type__ = "sessionStorage";');
    expect(html).toContain('window.__nocobase_api_client_share_token__ = true;');
  });

  it('proxies /<app>/v2/api requests to the configured NocoBase API URL', async () => {
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
      basePath: '/hub',
      nocoBaseApiUrl: `${nocoBaseApiUrl}/nocobase/api/`,
    });

    const response = await app.request('http://localhost/hub/v2/api/systemSettings:get?locale=zh-CN', {
      headers: {
        host: '127.0.0.1:13000',
        origin: 'http://127.0.0.1:13000',
        referer: 'http://127.0.0.1:13000/hub/login',
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      method: 'GET',
      url: '/nocobase/api/systemSettings:get?locale=zh-CN',
      host: new URL(nocoBaseApiUrl).host,
      origin: nocoBaseApiUrl,
      referer: `${nocoBaseApiUrl}/nocobase/hub/login`,
      forwardedHost: '127.0.0.1:13000',
      forwardedPrefix: '/hub/v2/api',
      forwardedProto: 'http',
    });
  });

  it('returns a JSON error when the API proxy target is not configured', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-hub-client-'));
    tempDirs.push(root);
    writeFileSync(path.join(root, 'index.html'), '<main>hub app</main>');

    const app = createApp({
      basePath: '/hub',
      clientIndexPath: path.join(root, 'index.html'),
    });

    const response = await app.request('http://localhost/hub/v2/api/oidc:checkRedirect?redirect=%2Fhub%2F');

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      error: 'NocoBase API proxy target is not configured.',
    });
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
      basePath: '/hub',
      nocoBaseApiUrl: `${nocoBaseApiUrl}/nocobase/api/`,
    });

    const response = await app.request('http://localhost/hub/v2/api/systemSettings:get');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('content-length')).toBeNull();
    await expect(response.text()).resolves.toBe(payload);
  });

  it('keeps hub API routes on the hub server when Vite dev proxy is enabled', async () => {
    let viteRequestCount = 0;
    const viteDevUrl = await startHttpStub(() => {
      viteRequestCount += 1;
    });
    const app = createStandaloneServer({ viteDevUrl });

    const response = await app.request('http://localhost/hub/api/healthz');

    await expect(response.json()).resolves.toEqual({
      ok: true,
      app: {
        name: 'hub',
        basePath: '/hub',
      },
      basePath: '/hub',
    });
    expect(viteRequestCount).toBe(0);
  });

  it('proxies hub client routes to Vite dev server', async () => {
    const viteDevUrl = await startHttpStub((_request, response) => {
      response.setHeader('content-type', 'text/plain; charset=utf-8');
      response.end(`vite:${_request.method}:${_request.url}`);
    });
    const app = createStandaloneServer({ viteDevUrl });

    const response = await app.request('http://localhost/hub/settings?tab=apps');

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('vite:GET:/hub/settings?tab=apps');
  });

  it('injects browser runtime config when serving the production client index', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-hub-client-'));
    tempDirs.push(root);
    const indexPath = path.join(root, 'index.html');
    writeFileSync(
      indexPath,
      [
        '<!doctype html>',
        '<html>',
        '<body>',
        '<div id="root"></div>',
        '<script type="module" src="/hub/assets/index.js"></script>',
        '</body>',
        '</html>',
      ].join(''),
    );

    const app = createApp({
      basePath: '/hub',
      apiProxyPath: '/v2/api',
      clientIndexPath: indexPath,
      nocoBaseApiUrl: false,
    });

    const response = await app.request('http://localhost/hub/settings');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('window.NOCOBASE_PORTAL_BASE = "/hub/";');
    expect(html).toContain('window.NOCOBASE_API_URL = "/hub/v2/api";');
    expect(html.indexOf('window.NOCOBASE_PORTAL_BASE')).toBeLessThan(html.indexOf('<script type="module"'));
  });

  it('serves production client assets before the SPA fallback', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-hub-client-'));
    tempDirs.push(root);
    mkdirSync(path.join(root, 'assets'));
    writeFileSync(path.join(root, 'index.html'), '<script type="module" src="/hub/assets/index.js"></script>');
    writeFileSync(path.join(root, 'assets/index.js'), 'console.log("hub asset");');

    const app = createApp({
      basePath: '/hub',
      clientIndexPath: path.join(root, 'index.html'),
      nocoBaseApiUrl: false,
    });

    const response = await app.request('http://localhost/hub/assets/index.js');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    await expect(response.text()).resolves.toBe('console.log("hub asset");');
  });

  it('does not return the SPA index for missing production client assets', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-hub-client-'));
    tempDirs.push(root);
    mkdirSync(path.join(root, 'assets'));
    writeFileSync(path.join(root, 'index.html'), '<main>hub app</main>');

    const app = createApp({
      basePath: '/hub',
      clientIndexPath: path.join(root, 'index.html'),
      nocoBaseApiUrl: false,
    });

    const response = await app.request('http://localhost/hub/assets/missing.js');

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
