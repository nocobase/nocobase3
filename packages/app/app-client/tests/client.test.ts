import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AppRequestError,
  createAppClient,
  resolveAppBase,
} from '../src/client.js';

/**
 * What the bundler compiled into the module under test. Vite inlines `import.meta.env.BASE_URL` at transform time, so
 * a test cannot stub it; reading the same constant here is how the fallback branch gets an expected value.
 */
const bundlerBase = import.meta.env.BASE_URL;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveAppBase', () => {
  it('reads the base path the server injected at runtime', () => {
    vi.stubGlobal('window', { APP_BASE_PATH: '/main/' });

    expect(resolveAppBase()).toBe('/main/');
    // Injected at runtime, so it has to win over whatever the bundler knew at build time.
    expect(resolveAppBase()).not.toBe(bundlerBase);
  });

  it('normalizes a runtime base path missing its slashes', () => {
    vi.stubGlobal('window', { APP_BASE_PATH: 'main' });

    expect(resolveAppBase()).toBe('/main/');
  });

  it('normalizes a nested base path with repeated slashes', () => {
    vi.stubGlobal('window', { APP_BASE_PATH: '///apps/demo//' });

    expect(resolveAppBase()).toBe('/apps/demo/');
  });

  it("falls back to the bundler's base when nothing was injected", () => {
    // The development server, which serves the client without injecting the runtime global.
    vi.stubGlobal('window', {});

    expect(resolveAppBase()).toBe(bundlerBase);
  });

  it('ignores a runtime base that is not a string', () => {
    vi.stubGlobal('window', { APP_BASE_PATH: 42 });

    expect(resolveAppBase()).toBe(bundlerBase);
  });

  it('serves from the origin root when the runtime base is a single slash', () => {
    vi.stubGlobal('window', { APP_BASE_PATH: '/' });

    expect(resolveAppBase()).toBe('/');
  });

  it('serves from the origin root when the runtime base is empty', () => {
    vi.stubGlobal('window', { APP_BASE_PATH: '' });

    expect(resolveAppBase()).toBe('/');
  });

  it('serves from the origin root outside a browser', () => {
    vi.stubGlobal('window', undefined);

    expect(resolveAppBase()).toBe('/');
  });
});

describe('createAppClient', () => {
  it('derives the realtime endpoint from a configured API base URL', () => {
    let websocketUrl: string | undefined;
    class MockWebSocket {
      public static readonly CONNECTING = 0;
      public readonly readyState = MockWebSocket.CONNECTING;

      public constructor(url: string) {
        websocketUrl = url;
      }
    }
    vi.stubGlobal('window', {
      location: {
        href: 'https://ui.example.com/main/',
        origin: 'https://ui.example.com',
      },
    });
    vi.stubGlobal('WebSocket', MockWebSocket);

    const client = createAppClient({
      baseURL: 'https://ui.example.com/apps/demo/api',
    });
    client.realtime?.subscribe('test:topic', vi.fn());

    expect(websocketUrl).toBe('wss://ui.example.com/apps/demo/ws');
  });

  it('uses an explicit realtime endpoint override', () => {
    let websocketUrl: string | undefined;
    class MockWebSocket {
      public static readonly CONNECTING = 0;
      public readonly readyState = MockWebSocket.CONNECTING;

      public constructor(url: string) {
        websocketUrl = url;
      }
    }
    vi.stubGlobal('window', {
      location: {
        href: 'https://ui.example.com/main/',
        origin: 'https://ui.example.com',
      },
    });
    vi.stubGlobal('WebSocket', MockWebSocket);

    const client = createAppClient({ realtimeURL: '/custom/realtime' });
    client.realtime?.subscribe('test:topic', vi.fn());

    expect(websocketUrl).toBe('wss://ui.example.com/custom/realtime');
  });

  it('lets the browser add the multipart boundary for FormData requests', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'file-1' } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createAppClient({ baseURL: '/main/api', fetch });
    const body = new FormData();
    body.append('file', new File(['content'], 'report.txt'));

    await client.request('orders/1/attachments', {
      method: 'POST',
      body,
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe('/main/api/orders/1/attachments');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body,
      credentials: 'include',
    });
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('keeps JSON defaults while preserving explicit headers', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: true }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createAppClient({ baseURL: '/main/api', fetch });

    await client.request('settings', {
      method: 'POST',
      headers: { Accept: 'application/problem+json', 'X-Request': 'test' },
      body: JSON.stringify({ enabled: true }),
    });

    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get('Accept')).toBe('application/problem+json');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Request')).toBe('test');
  });

  it.each([
    [
      'plain text',
      'Upstream authentication failed.',
      'Upstream authentication failed.',
    ],
    [
      'a nested error envelope',
      JSON.stringify({ error: { message: 'Access to this file is denied.' } }),
      'Access to this file is denied.',
    ],
  ])(
    'preserves %s response details in request errors',
    async (_label, body, message) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response(body, { status: 403 }));
      const client = createAppClient({ baseURL: '/main/api', fetch });

      const error = await client
        .request('files')
        .catch((value: unknown) => value);

      expect(error).toBeInstanceOf(AppRequestError);
      expect(error).toMatchObject({ status: 403, message });
    },
  );

  it('returns a streaming response body through the same API transport', async () => {
    const body = new ReadableStream<Uint8Array>();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(body, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const client = createAppClient({ baseURL: '/main/api', fetch });

    await expect(
      client.stream('ai/aiConversations:sendMessages', {
        method: 'POST',
        body: JSON.stringify({ sessionId: 'session-1' }),
      }),
    ).resolves.toBe(body);

    expect(fetch).toHaveBeenCalledWith(
      '/main/api/ai/aiConversations:sendMessages',
      expect.objectContaining({
        credentials: 'include',
      }),
    );
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get('Accept')).toBe('text/event-stream');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('throws AppRequestError when a streaming request fails', async () => {
    const client = createAppClient({
      fetch: async (): Promise<Response> =>
        new Response(JSON.stringify({ message: 'Stream denied' }), {
          status: 403,
        }),
    });

    await expect(client.stream('ai/stream')).rejects.toMatchObject({
      name: 'AppRequestError',
      message: 'Stream denied',
      status: 403,
    } satisfies Partial<AppRequestError>);
  });
});
