import { createServer as createHttpServer, type Server } from 'node:http';
import { gzipSync } from 'node:zlib';

import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createNocoBaseApiProxyHeaders,
  createOriginProxyHandler,
  proxyRequest,
  registerNocoBaseApiProxyRoutes,
  resolveNocoBaseApiUrl,
} from '../src/proxy/index.js';

const servers: Server[] = [];

afterEach(async () => {
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

describe('HTTP proxy', () => {
  it('strips compressed upstream response headers before returning proxied responses', async () => {
    const payload = JSON.stringify({ ok: true });
    const compressedPayload = gzipSync(payload);
    const upstreamUrl = await startHttpStub((_request, response) => {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('content-encoding', 'gzip');
      response.setHeader('content-length', String(compressedPayload.byteLength));
      response.end(compressedPayload);
    });

    const response = await proxyRequest(
      new Request('http://localhost/source'),
      new URL('/target', upstreamUrl),
      {
        unavailableMessage: 'Upstream server is unavailable.',
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('content-length')).toBeNull();
    await expect(response.text()).resolves.toBe(payload);
  });
});

describe('NocoBase API proxy', () => {
  it('resolves empty and disabled target values as undefined', () => {
    expect(resolveNocoBaseApiUrl(undefined)).toBeUndefined();
    expect(resolveNocoBaseApiUrl(false)).toBeUndefined();
    expect(resolveNocoBaseApiUrl('false')).toBeUndefined();
    expect(resolveNocoBaseApiUrl('0')).toBeUndefined();
    expect(resolveNocoBaseApiUrl('https://example.com/api/')?.toString()).toBe('https://example.com/api/');
  });

  it('registers NocoBase API proxy routes with forwarded headers', async () => {
    const upstreamUrl = await startHttpStub((request, response) => {
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          method: request.method,
          url: request.url,
          host: request.headers.host,
          origin: request.headers.origin,
          referer: request.headers.referer,
          forwardedHost: request.headers['x-forwarded-host'],
          forwardedPrefix: request.headers['x-forwarded-prefix'],
          forwardedProto: request.headers['x-forwarded-proto'],
        }),
      );
    });
    const app = new Hono();
    registerNocoBaseApiProxyRoutes(app, {
      apiProxyPath: '/main/test/v2/api',
      nocoBaseApiUrl: new URL(`${upstreamUrl}/nocobase/api/`),
    });

    const response = await app.request('http://localhost/main/test/v2/api/systemSettings:get?locale=zh-CN', {
      headers: {
        host: '127.0.0.1:15000',
        origin: 'http://127.0.0.1:15000',
        referer: 'http://127.0.0.1:15000/main/test/login',
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      method: 'GET',
      url: '/nocobase/api/systemSettings:get?locale=zh-CN',
      host: new URL(upstreamUrl).host,
      origin: 'http://127.0.0.1:15000',
      referer: 'http://127.0.0.1:15000/main/test/login',
      forwardedHost: '127.0.0.1:15000',
      forwardedPrefix: '/main/test/v2/api',
      forwardedProto: 'http',
    });
  });

  it('returns a JSON error when the NocoBase API target is not configured', async () => {
    const app = new Hono();
    registerNocoBaseApiProxyRoutes(app, {
      apiProxyPath: '/main/test/v2/api',
      nocoBaseApiUrl: undefined,
    });

    const response = await app.request('http://localhost/main/test/v2/api/systemSettings:get');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'NocoBase API proxy target is not configured.',
    });
  });
});

describe('NocoBase API proxy headers for a cross-site upstream', () => {
  const upstream = new URL('https://remote.example.com/api');

  const forwardedFromLocalhost = (extra: Record<string, string>) =>
    createNocoBaseApiProxyHeaders(
      new Request('http://127.0.0.1:3000/main/test/v2/api/auth:signIn', {
        method: 'POST',
        headers: { host: '127.0.0.1:3000', ...extra },
      }),
      '/main/test/v2/api',
      upstream,
    );

  it('aligns origin and x-forwarded-* on the upstream site', () => {
    const headers = forwardedFromLocalhost({
      origin: 'http://127.0.0.1:3000',
      referer: 'http://127.0.0.1:3000/main/test/login',
    });

    expect(headers.get('origin')).toBe(upstream.origin);
    expect(headers.get('x-forwarded-host')).toBe(upstream.host);
    expect(headers.get('x-forwarded-proto')).toBe('https');
    expect(`${headers.get('x-forwarded-proto')}://${headers.get('x-forwarded-host')}`).toBe(
      headers.get('origin'),
    );
  });

  it('aligns referer too, since the upstream falls back to it without an origin', () => {
    const headers = forwardedFromLocalhost({
      referer: 'http://127.0.0.1:3000/main/test/login',
    });

    expect(new URL(headers.get('referer') ?? '').origin).toBe(upstream.origin);
  });

  it('does not invent an origin the browser never sent', () => {
    const headers = forwardedFromLocalhost({});

    expect(headers.has('origin')).toBe(false);
    expect(headers.has('referer')).toBe(false);
    expect(headers.get('x-forwarded-host')).toBe(upstream.host);
  });

  it('still reports the proxy mount point', () => {
    expect(forwardedFromLocalhost({}).get('x-forwarded-prefix')).toBe('/main/test/v2/api');
  });

  it('leaves a loopback upstream on the faithful-relay path', () => {
    const headers = createNocoBaseApiProxyHeaders(
      new Request('http://site.example.com/main/test/v2/api/auth:signIn', {
        method: 'POST',
        headers: {
          host: 'site.example.com',
          origin: 'https://site.example.com',
          'x-forwarded-host': 'site.example.com',
          'x-forwarded-proto': 'https',
        },
      }),
      '/main/test/v2/api',
      new URL('http://127.0.0.1:13000/api'),
    );

    expect(headers.get('origin')).toBe('https://site.example.com');
    expect(headers.get('x-forwarded-host')).toBe('site.example.com');
    expect(headers.get('x-forwarded-proto')).toBe('https');
  });
});

describe('origin proxy', () => {
  it('proxies requests to the target origin', async () => {
    const upstreamUrl = await startHttpStub((request, response) => {
      response.setHeader('content-type', 'text/plain; charset=utf-8');
      response.end(`origin:${request.method}:${request.url}`);
    });
    const proxy = createOriginProxyHandler(new URL(upstreamUrl), {
      unavailableMessage: 'Dev server is unavailable.',
    });

    const response = await proxy(new Request('http://localhost/main/test/settings?tab=apps'));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('origin:GET:/main/test/settings?tab=apps');
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
        reject(new Error('Failed to resolve proxy stub address.'));
        return;
      }

      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}
