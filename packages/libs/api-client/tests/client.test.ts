import { describe, expect, it, vi } from 'vitest';

import { ApiClientError, createApiClient } from '../src/index.js';

interface Order {
  readonly id: string;
  readonly status: 'pending' | 'confirmed';
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) values.push(value);
  return values;
}

function ndjsonResponse(
  text: string,
  chunkSizes: readonly number[] = [],
): Response {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        let offset = 0;
        for (const size of chunkSizes) {
          controller.enqueue(bytes.slice(offset, offset + size));
          offset += size;
        }
        if (offset < bytes.length) controller.enqueue(bytes.slice(offset));
        controller.close();
      },
    }),
    {
      headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
    },
  );
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

  it('streams Repository findMany records through asynchronous iteration', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      ndjsonResponse(
        [
          JSON.stringify({
            type: 'record',
            data: { id: '订单-1', status: 'pending' },
          }),
          JSON.stringify({
            type: 'record',
            data: { id: 'order-2', status: 'confirmed' },
          }),
          JSON.stringify({ type: 'end' }),
          '',
        ].join('\n'),
        [1, 7, 13, 2, 5],
      ),
    );
    const api = createApiClient({ baseURL: '/api', fetch: request });

    await expect(
      collect(
        api.repository<Order>('sales/orders').findMany({
          filter: { status: 'pending' },
        }),
      ),
    ).resolves.toEqual([
      { id: '订单-1', status: 'pending' },
      { id: 'order-2', status: 'confirmed' },
    ]);

    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe('/api/sales%2Forders:findMany');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ filter: { status: 'pending' } }));
    expect(new Headers(init?.headers).get('accept')).toBe(
      'application/x-ndjson',
    );
  });

  it('reports framed and incomplete Repository stream failures', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        ndjsonResponse(
          `${JSON.stringify({
            type: 'error',
            error: { code: 'INVALID_FILTER', message: 'Invalid filter' },
          })}\n`,
        ),
      )
      .mockResolvedValueOnce(
        ndjsonResponse(
          `${JSON.stringify({
            type: 'record',
            data: { id: 'order-1', status: 'pending' },
          })}\n`,
        ),
      );
    const orders = createApiClient({
      baseURL: '/api',
      fetch: request,
    }).repository<Order>('orders');

    await expect(collect(orders.findMany())).rejects.toMatchObject<
      Partial<ApiClientError>
    >({
      name: 'ApiClientError',
      status: 200,
      code: 'INVALID_FILTER',
      message: 'Invalid filter',
    });
    await expect(collect(orders.findMany())).rejects.toMatchObject<
      Partial<ApiClientError>
    >({
      code: 'INCOMPLETE_REPOSITORY_STREAM',
    });
  });

  it('cancels a Repository response when iteration stops early', async () => {
    let cancelled = false;
    let requestSignal: AbortSignal | null | undefined;
    const request = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      requestSignal = init?.signal;
      return Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  `${JSON.stringify({
                    type: 'record',
                    data: { id: 'order-1', status: 'pending' },
                  })}\n`,
                ),
              );
            },
            cancel() {
              cancelled = true;
            },
          }),
        ),
      );
    });
    const query = createApiClient({ baseURL: '/api', fetch: request })
      .repository<Order>('orders')
      .findMany();

    for await (const order of query) {
      expect(order.id).toBe('order-1');
      break;
    }

    expect(cancelled).toBe(true);
    expect(requestSignal?.aborted).toBe(true);
  });

  it('prevents mixing or repeating Repository query consumption modes', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(
        ndjsonResponse(`${JSON.stringify({ type: 'end' })}\n`),
      );
    const orders = createApiClient({
      baseURL: '/api',
      fetch: request,
    }).repository<Order>('orders');
    const collected = orders.findMany();
    const streamed = orders.findMany();

    await expect(collected).resolves.toEqual([]);
    expect(() => collected[Symbol.asyncIterator]()).toThrowError(
      expect.objectContaining({ code: 'QUERY_ALREADY_CONSUMED' }),
    );
    await expect(collect(streamed)).resolves.toEqual([]);
    expect(() => streamed[Symbol.asyncIterator]()).toThrowError(
      expect.objectContaining({ code: 'QUERY_ALREADY_CONSUMED' }),
    );
    await expect(streamed).rejects.toMatchObject({
      code: 'QUERY_ALREADY_CONSUMED',
    });
  });

  it('snapshots findMany input before its lazy request starts', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [] }));
    const orders = createApiClient({
      baseURL: '/api',
      fetch: request,
    }).repository<Order>('orders');
    const input = { filter: { status: 'pending' as const }, limit: 10 };
    const query = orders.findMany(input);

    input.filter.status = 'confirmed';
    input.limit = 20;
    await query;

    expect(request.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ filter: { status: 'pending' }, limit: 10 }),
    );
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
