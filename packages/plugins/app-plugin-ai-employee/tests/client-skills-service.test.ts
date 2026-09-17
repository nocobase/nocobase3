import type { ApiClient } from '@nocobase/app-client';
import { describe, expect, it, vi } from 'vitest';
import { listAISkills, listAITools } from '../client/ai-employee-service.js';

const skills = [
  {
    name: 'analysis',
    description: 'Analyze data',
    introduction: { title: 'Data analysis', about: 'An analyst skill' },
    scope: 'GENERAL',
    from: 'loader',
  },
  { name: 'writing', description: 'Write documents' },
];

describe('Skills metadata API', () => {
  it.each([skills, { data: skills }, { data: { rows: skills } }])(
    'reads all skill metadata using the existing list endpoint: %j',
    async (response) => {
      const request = vi.fn().mockResolvedValue(response);
      const api = { request } as unknown as ApiClient;
      const signal = new AbortController().signal;
      const result = await listAISkills(signal, api);
      expect(request).toHaveBeenCalledExactlyOnceWith({
        path: 'ai/aiSkills:list',
        method: 'GET',
        signal,
      });
      expect(result).toMatchObject([
        {
          name: 'analysis',
          title: 'Data analysis',
          description: 'Analyze data',
          about: 'An analyst skill',
          scope: 'GENERAL',
          from: 'loader',
        },
        { name: 'writing', description: 'Write documents' },
      ]);
      expect(result[1].title).toBeUndefined();
      expect(result[1].about).toBeUndefined();
    },
  );

  it('reads management titles and prefers introduction titles when both exist', async () => {
    const api = {
      request: vi.fn().mockResolvedValue([
        {
          name: 'managed',
          title: 'Managed title',
          description: 'Managed description',
        },
        {
          name: 'loaded',
          title: 'Fallback',
          introduction: { title: 'Introduction title' },
        },
      ]),
    } as unknown as ApiClient;
    await expect(listAISkills(undefined, api)).resolves.toMatchObject([
      {
        name: 'managed',
        title: 'Managed title',
        description: 'Managed description',
      },
      { name: 'loaded', title: 'Introduction title' },
    ]);
  });

  it('distinguishes request failures from an empty skill catalog', async () => {
    const error = new Error('Unavailable');
    const request = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce([]);
    const api = { request } as unknown as ApiClient;
    await expect(listAISkills(undefined, api)).rejects.toBe(error);
    await expect(listAISkills(undefined, api)).resolves.toEqual([]);
  });

  it('propagates cancellation and retains the existing optional tools fallback', async () => {
    const error = new DOMException('Aborted', 'AbortError');
    const api = {
      request: vi.fn().mockRejectedValue(error),
    } as unknown as ApiClient;
    const controller = new AbortController();
    controller.abort();
    await expect(listAISkills(controller.signal, api)).rejects.toBe(error);
    await expect(listAITools(undefined, api)).resolves.toEqual([]);
  });
});
