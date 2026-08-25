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
import { createNocoBaseApiProxyHeaders } from '../../server/app.ts';

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
      path.join(tmpdir(), 'nocobase-hub-embedded-root-'),
    );
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

    const api = await app.request(
      'http://localhost/v2/api/oidc:checkRedirect?redirect=%2Fhub%2F',
    );
    await expect(api.json()).resolves.toEqual({
      url: '/nocobase/api/oidc:checkRedirect?redirect=%2Fhub%2F',
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

    const response = await app.request(
      'http://localhost/hub/v2/api/systemSettings:get?locale=zh-CN',
      {
        headers: {
          host: '127.0.0.1:13000',
          origin: 'http://127.0.0.1:13000',
          referer: 'http://127.0.0.1:13000/hub/login',
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
      referer: 'http://127.0.0.1:13000/hub/login',
      forwardedHost: '127.0.0.1:13000',
      forwardedPrefix: '/hub/v2/api',
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
    const app = createApp({
      basePath: '/hub',
      nocoBaseApiUrl: `${nocoBaseApiUrl}/nocobase/api/`,
    });

    // A TLS-terminating proxy in front of this process: the site is https, but this hop is cleartext
    // and its x-forwarded-* headers carry the browser's real context.
    const response = await app.request(
      'http://localhost/hub/v2/api/auth:signIn',
      {
        method: 'POST',
        headers: {
          host: 'apps.example.com',
          origin: 'https://apps.example.com',
          referer: 'https://apps.example.com/hub/login',
          'x-forwarded-host': 'apps.example.com',
          'x-forwarded-proto': 'https',
        },
      },
    );

    expect(response.status).toBe(200);
    const forwarded = (await response.json()) as Record<string, string>;

    // Existing x-forwarded-* must survive. Overwriting them with this connection's details would
    // report the https site as http, and the origin comparison below would fail on the scheme alone.
    expect(forwarded.forwardedProto).toBe('https');
    expect(forwarded.forwardedHost).toBe('apps.example.com');
    expect(forwarded.origin).toBe('https://apps.example.com');
    expect(forwarded.referer).toBe('https://apps.example.com/hub/login');

    // The check the upstream actually performs.
    const requestOrigin = `${forwarded.forwardedProto}://${forwarded.forwardedHost}`;
    expect(forwarded.origin).toBe(requestOrigin);
  });

  it('returns a JSON error when the API proxy target is not configured', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-hub-client-'));
    tempDirs.push(root);
    writeFileSync(path.join(root, 'index.html'), '<main>hub app</main>');

    const app = createApp({
      basePath: '/hub',
      clientIndexPath: path.join(root, 'index.html'),
    });

    const response = await app.request(
      'http://localhost/hub/v2/api/oidc:checkRedirect?redirect=%2Fhub%2F',
    );

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
      response.setHeader(
        'content-length',
        String(compressedPayload.byteLength),
      );
      response.end(compressedPayload);
    });
    const app = createApp({
      basePath: '/hub',
      nocoBaseApiUrl: `${nocoBaseApiUrl}/nocobase/api/`,
    });

    const response = await app.request(
      'http://localhost/hub/v2/api/systemSettings:get',
    );

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
      apiProxyPath: '/v2/api',
      clientIndexPath: indexPath,
      nocoBaseApiUrl: false,
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
      nocoBaseApiUrl: false,
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
      nocoBaseApiUrl: false,
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

/**
 * Header handling when the upstream is a *different site* -- the usual local-development setup,
 * where `NOCOBASE_API_PROXY_TARGET` points at a shared remote NocoBase.
 *
 * **This group is what makes `pnpm dev` able to sign in.** Relaying the browser's hop faithfully
 * (correct for the loopback topology covered above) is guaranteed to fail here: the browser's origin
 * is `http://127.0.0.1:3000`, but the remote site's reverse proxy rewrites `x-forwarded-host` to its
 * own hostname, so the upstream derives `https://remote-site` and the check fails with
 * `403 Invalid sign-in origin`.
 *
 * These call the header builder directly rather than going through `createApp`: the cross-site
 * branch requires a non-loopback upstream, and a stub HTTP server can only bind loopback.
 */
describe('forwarded headers for a cross-site upstream', () => {
  const upstream = new URL('https://remote.example.com/api');

  const forwardedFromLocalhost = (extra: Record<string, string>) =>
    createNocoBaseApiProxyHeaders(
      new Request('http://127.0.0.1:3000/hub/v2/api/auth:signIn', {
        method: 'POST',
        headers: { host: '127.0.0.1:3000', ...extra },
      }),
      '/hub/v2/api',
      upstream,
    );

  it('aligns origin and x-forwarded-* on the upstream site', () => {
    const headers = forwardedFromLocalhost({
      origin: 'http://127.0.0.1:3000',
      referer: 'http://127.0.0.1:3000/hub/login',
    });

    expect(headers.get('origin')).toBe(upstream.origin);
    expect(headers.get('x-forwarded-host')).toBe(upstream.host);
    expect(headers.get('x-forwarded-proto')).toBe('https');
    // The point of the three assertions above: the requestOrigin the upstream derives has to equal,
    // verbatim, the origin it receives.
    expect(
      `${headers.get('x-forwarded-proto')}://${headers.get('x-forwarded-host')}`,
    ).toBe(headers.get('origin'));
  });

  it('aligns referer too, since the upstream falls back to it without an origin', () => {
    const headers = forwardedFromLocalhost({
      referer: 'http://127.0.0.1:3000/hub/login',
    });

    expect(new URL(headers.get('referer') ?? '').origin).toBe(upstream.origin);
  });

  it('does not invent an origin the browser never sent', () => {
    // Requests without an origin (curl, server-side calls) do not trigger the origin check at all.
    // Adding one would turn "no origin declared" into "claims to come from the site itself".
    const headers = forwardedFromLocalhost({});

    expect(headers.has('origin')).toBe(false);
    expect(headers.has('referer')).toBe(false);
    // The forwarded pair still has to be aligned: it decides who the upstream thinks it is,
    // independently of whether an origin was sent.
    expect(headers.get('x-forwarded-host')).toBe(upstream.host);
  });

  it('still reports the proxy mount point', () => {
    expect(forwardedFromLocalhost({}).get('x-forwarded-prefix')).toBe(
      '/hub/v2/api',
    );
  });

  it('leaves a loopback upstream on the faithful-relay path', () => {
    // The counterpart of the group above: production proxies over loopback, where the browser's hop
    // must reach the upstream unchanged.
    const headers = createNocoBaseApiProxyHeaders(
      new Request('http://site.example.com/hub/v2/api/auth:signIn', {
        method: 'POST',
        headers: {
          host: 'site.example.com',
          origin: 'https://site.example.com',
          'x-forwarded-host': 'site.example.com',
          'x-forwarded-proto': 'https',
        },
      }),
      '/hub/v2/api',
      new URL('http://127.0.0.1:13000/api'),
    );

    expect(headers.get('origin')).toBe('https://site.example.com');
    expect(headers.get('x-forwarded-host')).toBe('site.example.com');
    expect(headers.get('x-forwarded-proto')).toBe('https');
  });
});
