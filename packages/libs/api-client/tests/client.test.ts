import { describe, expect, it, vi } from 'vitest';

import { ApiClientError, createApiClient } from '../src/index.js';

interface Order {
  readonly id: string;
  readonly status: 'pending' | 'confirmed';
}

describe('createApiClient', () => {
  it('builds an object-style request with query, headers, and credentials', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: { healthy: true } }));
    const api = createApiClient({
      baseURL: '/main/api/',
      fetch: request,
      headers: async () => ({ 'x-runtime': 'test' }),
    });

    await expect(
      api.request<{ data: { healthy: boolean } }>({
        path: '/health?mode=full#status',
        method: 'GET',
        query: {
          verbose: true,
          tags: ['db', 'queue'],
          empty: null,
          ignored: undefined,
        },
        headers: { 'x-request': 'one' },
      }),
    ).resolves.toEqual({ data: { healthy: true } });

    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe(
      '/main/api/health?mode=full&verbose=true&tags=db&tags=queue&empty=#status',
    );
    expect(init?.credentials).toBe('include');
    expect(new Headers(init?.headers).get('x-runtime')).toBe('test');
    expect(new Headers(init?.headers).get('x-request')).toBe('one');
  });

  it('serializes JSON and reports structured HTTP failures', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: { id: 'order-1' } }))
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: 'ORDER_INVALID', message: 'Order is invalid' } },
          { status: 422, headers: { 'x-request-id': 'request-1' } },
        ),
      );
    const api = createApiClient({ baseURL: '/api', fetch: request });

    await api.request({
      path: '/orders',
      method: 'POST',
      json: { status: 'pending' },
    });
    expect(request.mock.calls[0]?.[1]?.body).toBe('{"status":"pending"}');
    expect(
      new Headers(request.mock.calls[0]?.[1]?.headers).get('content-type'),
    ).toBe('application/json');

    const failure = api.request({ path: '/orders/order-1', method: 'GET' });
    await expect(failure).rejects.toMatchObject<Partial<ApiClientError>>({
      name: 'ApiClientError',
      message: 'Order is invalid',
      status: 422,
      code: 'ORDER_INVALID',
      requestId: 'request-1',
      method: 'GET',
      url: '/api/orders/order-1',
    });
  });

  it('passes raw request bodies through without assigning a content type', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: { id: 'file-1' } }));
    const api = createApiClient({ baseURL: '/api', fetch: request });
    const body = new FormData();
    body.append('file', new File(['content'], 'report.txt'));

    await api.request({ path: 'files', method: 'POST', body });

    expect(request.mock.calls[0]?.[1]?.body).toBe(body);
    const headers = new Headers(request.mock.calls[0]?.[1]?.headers);
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.has('content-type')).toBe(false);
  });

  it('returns a streaming response through the shared transport', async () => {
    const body = new ReadableStream<Uint8Array>();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(body, { status: 200 }));
    const api = createApiClient({ baseURL: '/api', fetch: request });

    await expect(
      api.stream({
        path: 'ai/conversations:send',
        method: 'POST',
        json: { message: 'Hello' },
      }),
    ).resolves.toBe(body);

    const init = request.mock.calls[0]?.[1];
    expect(init?.body).toBe('{"message":"Hello"}');
    const headers = new Headers(init?.headers);
    expect(headers.get('accept')).toBe('text/event-stream');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('uses the same structured errors for failed streams', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { code: 'STREAM_DENIED', message: 'Stream denied' },
          { status: 403, headers: { 'x-request-id': 'request-2' } },
        ),
      );
    const api = createApiClient({ baseURL: '/api', fetch: request });

    await expect(api.stream({ path: 'ai/stream' })).rejects.toMatchObject<
      Partial<ApiClientError>
    >({
      name: 'ApiClientError',
      message: 'Stream denied',
      status: 403,
      code: 'STREAM_DENIED',
      requestId: 'request-2',
      method: 'GET',
      url: '/api/ai/stream',
    });
  });

  it('rejects a successful streaming response without a body', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const api = createApiClient({ baseURL: '/api', fetch: request });

    await expect(api.stream({ path: 'events' })).rejects.toMatchObject<
      Partial<ApiClientError>
    >({
      message: 'API streaming response has no body.',
      status: 204,
      method: 'GET',
      url: '/api/events',
    });
  });

  it('maps Repository calls onto the same request transport', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ data: { id: 'order-1', status: 'pending' } }),
      )
      .mockResolvedValueOnce(Response.json({ data: [] }));
    const api = createApiClient({ baseURL: '/api', fetch: request });
    const orders = api.repository<Order>('sales/orders');

    await expect(
      orders.findOne({ filter: { id: 'order-1' } }),
    ).resolves.toEqual({ id: 'order-1', status: 'pending' });
    await expect(
      orders.findMany({ filter: { status: 'pending' }, limit: 20 }),
    ).resolves.toEqual([]);

    expect(request.mock.calls[0]?.[0]).toBe('/api/sales%2Forders:findOne');
    expect(request.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(request.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ filter: { id: 'order-1' } }),
    );
    expect(request.mock.calls[1]?.[0]).toBe('/api/sales%2Forders:findMany');
  });

  it('maps the initial Repository mutation and predicate methods', async () => {
    const mutation = {
      record: { id: 'order-1', status: 'confirmed' as const },
      createdTargets: [],
      version: 2,
    };
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: 1 }))
      .mockResolvedValueOnce(Response.json({ data: true }))
      .mockResolvedValueOnce(Response.json({ data: mutation }))
      .mockResolvedValueOnce(Response.json({ data: mutation }))
      .mockResolvedValueOnce(Response.json({ data: { deleted: true } }));
    const api = createApiClient({ baseURL: '/api', fetch: request });
    const orders = api.repository<Order>('orders');

    await expect(orders.count({ filter: { status: 'pending' } })).resolves.toBe(
      1,
    );
    await expect(orders.exists({ filter: { id: 'order-1' } })).resolves.toBe(
      true,
    );
    await expect(
      orders.createOne({ values: { id: 'order-1', status: 'pending' } }),
    ).resolves.toEqual(mutation);
    await expect(
      orders.updateOne({
        filter: { id: 'order-1' },
        values: { status: 'confirmed' },
        ifVersion: 1,
      }),
    ).resolves.toEqual(mutation);
    await expect(
      orders.deleteOne({ filter: { id: 'order-1' }, ifVersion: 2 }),
    ).resolves.toEqual({ deleted: true });

    expect(request.mock.calls.map(([url]) => url)).toEqual([
      '/api/orders:count',
      '/api/orders:exists',
      '/api/orders:createOne',
      '/api/orders:updateOne',
      '/api/orders:deleteOne',
    ]);
  });
});
