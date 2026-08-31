// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
    const root = mkdtempSync(
      path.join(tmpdir(), 'nocobase-hub-embedded-client-'),
    );
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
    expect(html).toContain('window.NOCOBASE_API_URL = "/hub/api";');
  });

  it('reads embedded runtime config from dist/.env without using process.env', async () => {
    const appRoot = mkdtempSync(
      path.join(tmpdir(), 'nocobase-hub-embedded-root-'),
    );
    tempDirs.push(appRoot);
    const clientDir = path.join(appRoot, 'dist', 'client');
    mkdirSync(clientDir, { recursive: true });
    writeFileSync(
      path.join(appRoot, 'dist', '.env'),
      [
        'API_CLIENT_STORAGE_PREFIX=EMBEDDED_',
        'API_CLIENT_STORAGE_TYPE=sessionStorage',
        'API_CLIENT_SHARE_TOKEN=true',
      ].join('\n'),
    );
    writeFileSync(
      path.join(clientDir, 'index.html'),
      '<script type="module" src="/hub/assets/index.js"></script>',
    );

    const app = await createEmbeddedServer({
      id: 'hub',
      basePath: '/hub',
      rootDir: appRoot,
      clientDir,
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
    const app = createStandaloneServer({ viteDevUrl });

    const response = await app.request(
      'http://localhost/hub/settings?tab=apps',
      {
        headers: {
          origin: 'http://localhost',
          referer: 'http://localhost/hub/',
        },
      },
    );

    expect(response.status).toBe(200);
    const viteOrigin = new URL(viteDevUrl).origin;
    await expect(response.json()).resolves.toEqual({
      method: 'GET',
      url: '/hub/settings?tab=apps',
      origin: viteOrigin,
      referer: `${viteOrigin}/hub/`,
    });
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
      clientIndexPath: indexPath,
    });

    const response = await app.request('http://localhost/hub/settings');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('window.NOCOBASE_PORTAL_BASE = "/hub/";');
    expect(html).toContain('window.NOCOBASE_API_URL = "/hub/api";');
    expect(html.indexOf('window.NOCOBASE_PORTAL_BASE')).toBeLessThan(
      html.indexOf('<script type="module"'),
    );
  });

  it('serves production client assets before the SPA fallback', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-hub-client-'));
    tempDirs.push(root);
    mkdirSync(path.join(root, 'assets'));
    writeFileSync(
      path.join(root, 'index.html'),
      '<script type="module" src="/hub/assets/index.js"></script>',
    );
    writeFileSync(
      path.join(root, 'assets/index.js'),
      'console.log("hub asset");',
    );

    const app = createApp({
      basePath: '/hub',
      clientIndexPath: path.join(root, 'index.html'),
    });

    const response = await app.request('http://localhost/hub/assets/index.js');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/javascript; charset=utf-8',
    );
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    );
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
    });

    const response = await app.request(
      'http://localhost/hub/assets/missing.js',
    );

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
