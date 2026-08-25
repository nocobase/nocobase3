// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../server/app.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App runtime gateway', () => {
  it('keeps the App on the Hub origin and forwards the public request context', async () => {
    const upstream = vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init);
      return Response.json({
        method: request.method,
        url: new URL(request.url).pathname + new URL(request.url).search,
        host: request.headers.get('host'),
        forwardedHost: request.headers.get('x-forwarded-host'),
        forwardedProto: request.headers.get('x-forwarded-proto'),
        forwardedPrefix: request.headers.get('x-forwarded-prefix'),
      });
    });
    vi.stubGlobal('fetch', upstream);
    const targetUrl = 'http://app-host.internal:13200';
    const app = createApp({
      basePath: '/hub',
      appRuntimeGateway: { targetUrl },
    });

    const response = await app.request(
      'http://127.0.0.1:13001/crm/api/accounts:list?page=2',
      {
        headers: { host: '127.0.0.1:13001' },
      },
    );

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      method: 'GET',
      url: '/crm/api/accounts:list?page=2',
      host: 'app-host.internal:13200',
      forwardedHost: '127.0.0.1:13001',
      forwardedProto: 'http',
      forwardedPrefix: '/crm',
    });
  });

  it('does not expose App Host control routes through the browser gateway', async () => {
    const upstream = vi.fn<typeof fetch>(async () =>
      Promise.resolve(new Response('unexpected')),
    );
    vi.stubGlobal('fetch', upstream);
    const app = createApp({
      basePath: '/hub',
      appRuntimeGateway: { targetUrl: 'http://app-host.internal:13200' },
    });

    const response = await app.request('http://127.0.0.1:13001/__apps');

    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('keeps Hub routes owned by Hub instead of forwarding them to App Host', async () => {
    const upstream = vi.fn<typeof fetch>(async () =>
      Promise.resolve(new Response('unexpected')),
    );
    vi.stubGlobal('fetch', upstream);
    const app = createApp({
      basePath: '/hub',
      clientHandler: (request) =>
        new Response(`hub:${new URL(request.url).pathname}`),
      appRuntimeGateway: { targetUrl: 'http://app-host.internal:13200' },
    });

    const response = await app.request('http://127.0.0.1:13001/hub/apps');

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('hub:/hub/apps');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rewrites internal App Host redirects back to a same-origin path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        Promise.resolve(
          new Response(null, {
            status: 302,
            headers: {
              location: 'http://app-host.internal:13200/crm/login?from=gateway',
            },
          }),
        ),
      ),
    );
    const app = createApp({
      basePath: '/hub',
      appRuntimeGateway: { targetUrl: 'http://app-host.internal:13200' },
    });

    const response = await app.request('http://127.0.0.1:13001/crm/private');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/crm/login?from=gateway');
  });

  it('keeps redirects inside the mounted App when App Host returns a root-relative path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: '/login?from=app' },
          }),
        ),
      ),
    );
    const app = createApp({
      basePath: '/hub',
      appRuntimeGateway: { targetUrl: 'http://app-host.internal:13200' },
    });

    const response = await app.request('http://127.0.0.1:13001/crm/private');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/crm/login?from=app');
  });
});
