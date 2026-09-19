import { createApiClient } from '@nocobase/app-client';
import { describe, expect, it, vi } from 'vitest';
import {
  getManagedToolDetails,
  listManagedTools,
} from '../client/tools-management-service.js';

const summary = {
  name: '@acme/query & review?中文#100%',
  title: 'Query records',
  description: 'Read collection records',
  scope: 'SPECIFIED',
  source: 'custom-source',
};

describe('Tools management API', () => {
  it('reads the rows envelope without changing summaries or fetching details', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ rows: [summary] }));
    const api = createApiClient({
      baseURL: 'https://example.test/workspace/api',
      fetch,
    });
    const signal = new AbortController().signal;
    expect(await listManagedTools(api, signal)).toEqual([summary]);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://example.test/workspace/api/ai/aiTools:listAll',
      expect.objectContaining({ method: 'GET', signal }),
    );
  });

  it.each([
    null,
    {},
    { type: 'object', properties: { query: { type: 'string' } } },
  ])(
    'preserves the direct detail contract and schema %j, encoding the query name once',
    async (inputSchema) => {
      const detail = { ...summary, about: '# Query records', inputSchema };
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(Response.json(detail));
      const api = createApiClient({
        baseURL: 'https://example.test/nested/api',
        fetch,
      });
      const signal = new AbortController().signal;
      expect(await getManagedToolDetails(api, summary.name, signal)).toEqual(
        detail,
      );
      const [url, init] = fetch.mock.calls[0];
      const requestURL = new URL(String(url));
      expect(requestURL.pathname).toBe('/nested/api/ai/aiTools:getDetails');
      expect(requestURL.searchParams.get('name')).toBe(summary.name);
      expect(Array.from(requestURL.searchParams.keys())).toEqual(['name']);
      expect(requestURL.hash).toBe('');
      expect(requestURL.search).toContain('%26');
      expect(init).toMatchObject({ method: 'GET', signal });
      expect(init?.body).toBeUndefined();
    },
  );

  it('propagates failed and cancelled requests instead of synthesizing empty data', async () => {
    const error = new Error('Unavailable');
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(error);
    const api = createApiClient({ baseURL: 'https://example.test/api', fetch });
    await expect(listManagedTools(api)).rejects.toBe(error);
    await expect(getManagedToolDetails(api, summary.name)).rejects.toBe(error);
    const cancelled = new DOMException('Aborted', 'AbortError');
    fetch.mockRejectedValue(cancelled);
    const controller = new AbortController();
    controller.abort();
    await expect(
      getManagedToolDetails(api, summary.name, controller.signal),
    ).rejects.toBe(cancelled);
  });
});
