import type { ApiClient } from '@nocobase/app-client';
import { describe, expect, it, vi } from 'vitest';

import {
  getAIEmployee,
  listAIEmployees,
  listEnabledKnowledgeBases,
  updateAIEmployee,
  type AIEmployeeRecord,
} from '../client/ai-employee-service.ts';
import {
  listLLMProviders,
  listLLMServices,
  listProviderModels,
  updateLLMService,
} from '../client/llm-service-service.ts';

function createClient(): {
  readonly client: ApiClient;
  readonly request: ReturnType<typeof vi.fn<ApiClient['request']>>;
} {
  const request = vi.fn<ApiClient['request']>();
  const stream = vi.fn<ApiClient['stream']>();
  return { client: { request, stream } as ApiClient, request };
}

describe('AI Employee application client transport', () => {
  it('routes employee management through the plugin AI API mount', async () => {
    const { client, request } = createClient();
    request
      .mockResolvedValueOnce([{ username: 'atlas' }])
      .mockResolvedValueOnce({ username: 'atlas' })
      .mockResolvedValueOnce({ username: 'atlas', enabled: false });

    await listAIEmployees(undefined, client);
    await getAIEmployee('atlas/team', undefined, client);
    await updateAIEmployee(
      { username: 'atlas' },
      {
        enabled: false,
        about: null,
        modelSettings: {},
        skillSettings: { skills: [], tools: [] },
        enableKnowledgeBase: false,
        knowledgeBasePrompt: '',
        knowledgeBase: {},
      },
      client,
    );

    expect(request).toHaveBeenNthCalledWith(1, {
      path: 'ai/aiEmployees:list',
      method: 'GET',
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      path: 'ai/aiEmployees:get',
      method: 'GET',
      query: { key: 'atlas/team' },
    });
    expect(request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        path: 'ai/aiEmployees:update',
        method: 'PUT',
        query: { key: 'atlas' },
        json: expect.any(Object),
      }),
    );
  });

  it('keeps knowledge-base discovery on the application resource API', async () => {
    const { client, request } = createClient();
    request.mockResolvedValueOnce([]);

    await listEnabledKnowledgeBases(undefined, client);

    expect(request).toHaveBeenCalledWith({
      path: 'aiKnowledgeBase:list',
      method: 'GET',
      query: { paginate: false, 'filter[enabled]': true },
    });
  });

  it('routes LLM settings through the plugin AI API mount', async () => {
    const { client, request } = createClient();
    request
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        name: 'deepseek',
        provider: 'deepseek',
        enabled: true,
        enabledModels: { mode: 'recommended', models: [] },
      })
      .mockResolvedValueOnce([]);

    await listLLMServices(client);
    await listLLMProviders(client);
    await updateLLMService('deepseek/chat', { enabled: true }, client);
    await listProviderModels('deepseek', 'chat model', client);

    expect(request).toHaveBeenNthCalledWith(1, {
      path: 'ai/llmServices:list',
      method: 'GET',
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      path: 'ai/ai:listLLMProviders',
      method: 'GET',
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      path: 'ai/llmServices:update',
      method: 'PUT',
      query: { key: 'deepseek/chat' },
      json: { enabled: true },
    });
    expect(request).toHaveBeenNthCalledWith(4, {
      path: 'ai/ai:listProviderModels',
      method: 'POST',
      json: { llmService: 'deepseek', search: 'chat model' },
    });
  });

  it('does not require Portal SDK response envelopes', async () => {
    const { client, request } = createClient();
    const employee: AIEmployeeRecord = { username: 'direct-json' };
    request.mockResolvedValueOnce(employee);

    await expect(getAIEmployee('direct-json', undefined, client)).resolves.toBe(
      employee,
    );
  });
});
