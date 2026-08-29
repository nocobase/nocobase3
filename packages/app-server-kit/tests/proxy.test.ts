import { createServer as createHttpServer, type Server } from 'node:http';
import { gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createMountedOriginProxyHandler,
  createOriginProxyHandler,
  proxyRequest,
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
      response.setHeader(
        'content-length',
        String(compressedPayload.byteLength),
      );
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

describe('origin proxy', () => {
  it('proxies requests to the target origin', async () => {
    const upstreamUrl = await startHttpStub((request, response) => {
      response.setHeader('content-type', 'text/plain; charset=utf-8');
      response.end(`origin:${request.method}:${request.url}`);
    });
    const proxy = createOriginProxyHandler(new URL(upstreamUrl), {
      unavailableMessage: 'Dev server is unavailable.',
    });

    const response = await proxy(
      new Request('http://localhost/main/test/settings?tab=apps'),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(
      'origin:GET:/main/test/settings?tab=apps',
    );
  });

  it('restores a public base path and aligns same-origin browser headers', async () => {
    const upstreamUrl = await startHttpStub((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        response.setHeader('content-type', 'application/json; charset=utf-8');
        response.end(
          JSON.stringify({
            method: request.method,
            url: request.url,
            origin: request.headers.origin,
            referer: request.headers.referer,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      });
    });
    const proxy = createMountedOriginProxyHandler(new URL(upstreamUrl), {
      publicBasePath: '/main',
      unavailableMessage: 'Dev server is unavailable.',
    });

    const response = await proxy(
      new Request('http://localhost/settings?tab=apps', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
          referer: 'http://localhost/settings?tab=apps',
        },
        body: JSON.stringify({ enabled: true }),
      }),
    );

    expect(response.status).toBe(200);
    const targetOrigin = new URL(upstreamUrl).origin;
    await expect(response.json()).resolves.toEqual({
      method: 'POST',
      url: '/main/settings?tab=apps',
      origin: targetOrigin,
      referer: `${targetOrigin}/settings?tab=apps`,
      body: JSON.stringify({ enabled: true }),
    });
  });

  it('preserves external and malformed browser origin headers', async () => {
    const receivedHeaders: Array<{ origin?: string; referer?: string }> = [];
    const upstreamUrl = await startHttpStub((request, response) => {
      receivedHeaders.push({
        origin: request.headers.origin,
        referer: request.headers.referer,
      });
      response.end('ok');
    });
    const proxy = createMountedOriginProxyHandler(new URL(upstreamUrl), {
      publicBasePath: '/main',
    });

    await proxy(
      new Request('http://localhost/settings', {
        headers: {
          origin: 'https://external.example.com',
          referer: 'not-a-valid-url',
        },
      }),
    );

    expect(receivedHeaders).toEqual([
      {
        origin: 'https://external.example.com',
        referer: 'not-a-valid-url',
      },
    ]);
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
