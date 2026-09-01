import { afterEach, describe, expect, it, vi } from 'vitest';

import { NocoBaseClient, resolveNocoBaseAIUrl } from '../src/client/index.ts';

describe('NocoBase AI API URL', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['/v2/api', '/api/ai'],
    ['/v2/api/', '/api/ai'],
    ['/main/v2/api', '/main/api/ai'],
    ['/main/v2/api///', '/main/api/ai'],
    [
      'https://example.com/nocobase/v2/api/',
      'https://example.com/nocobase/api/ai',
    ],
  ])('derives the AI API URL from %s', (apiUrl, expected) => {
    expect(resolveNocoBaseAIUrl(apiUrl)).toBe(expected);
  });

  it('uses one client with a request-level AI API URL override', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new NocoBaseClient('https://example.com/nocobase/v2/api');
    await client.action('aiEmployees', 'list', {
      apiUrl: resolveNocoBaseAIUrl(client.getApiUrl()),
      method: 'GET',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://example.com/nocobase/api/ai/aiEmployees:list'),
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
    expect(client.getApiUrl()).toBe('https://example.com/nocobase/v2/api');
  });
});
