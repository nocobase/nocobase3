import { createApiClient } from '@nocobase/app-client';
import { describe, expect, it, vi } from 'vitest';
import {
  getManagedSkillDetails,
  listManagedSkills,
} from '../client/skills-management-service.js';

const summary = {
  name: '@acme/research & review?中文#100%',
  title: 'Research',
  description: 'Research guide',
  tools: [
    {
      name: 'search',
      title: 'Search',
      description: 'Search records',
      available: true,
    },
  ],
};

describe('Skills management API', () => {
  it('uses the management list contract without fetching Markdown', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ rows: [summary] }));
    const api = createApiClient({
      baseURL: 'https://example.test/workspace/api',
      fetch,
    });
    const signal = new AbortController().signal;
    expect(await listManagedSkills(api, signal)).toEqual([summary]);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://example.test/workspace/api/ai/aiSkills:listAll',
      expect.objectContaining({ method: 'GET', signal }),
    );
  });

  it('encodes special skill names once in the query and reads detail directly', async () => {
    const detail = { ...summary, content: '# Research' };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json(detail));
    const api = createApiClient({
      baseURL: 'https://example.test/nested/api',
      fetch,
    });
    const signal = new AbortController().signal;
    expect(await getManagedSkillDetails(api, summary.name, signal)).toEqual(
      detail,
    );
    const [url, init] = fetch.mock.calls[0];
    const requestURL = new URL(String(url));
    expect(requestURL.pathname).toBe('/nested/api/ai/aiSkills:getDetails');
    expect(requestURL.searchParams.get('name')).toBe(summary.name);
    expect(Array.from(requestURL.searchParams.keys())).toEqual(['name']);
    expect(requestURL.hash).toBe('');
    expect(requestURL.search).toContain('%26');
    expect(init).toMatchObject({ method: 'GET', signal });
    expect(init?.body).toBeUndefined();
  });

  it('propagates errors and cancellation instead of returning empty metadata', async () => {
    const error = new Error('Unavailable');
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(error);
    const api = createApiClient({ baseURL: 'https://example.test/api', fetch });
    await expect(listManagedSkills(api)).rejects.toBe(error);
    await expect(getManagedSkillDetails(api, summary.name)).rejects.toBe(error);
    const cancelled = new DOMException('Aborted', 'AbortError');
    fetch.mockRejectedValue(cancelled);
    const controller = new AbortController();
    controller.abort();
    await expect(
      getManagedSkillDetails(api, summary.name, controller.signal),
    ).rejects.toBe(cancelled);
  });
});
