import type { AppClient } from '@nocobase/app-client';
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
  readonly client: AppClient;
  readonly request: ReturnType<typeof vi.fn<AppClient['request']>>;
} {
  const request = vi.fn<AppClient['request']>();
  const stream = vi.fn<AppClient['stream']>();
  return { client: { request, stream }, request };
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

    expect(request).toHaveBeenNthCalledWith(1, 'ai/aiEmployees:list', {
      method: 'GET',
    });
    expect(request).toHaveBeenNthCalledWith(
      2,
      'ai/aiEmployees:get?key=atlas%2Fteam',
      { method: 'GET' },
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      'ai/aiEmployees:update?key=atlas',
      expect.objectContaining({
        method: 'PUT',
        body: expect.any(String),
      }),
    );
  });

  it('keeps knowledge-base discovery on the application resource API', async () => {
    const { client, request } = createClient();
    request.mockResolvedValueOnce([]);

    await listEnabledKnowledgeBases(undefined, client);

    expect(request).toHaveBeenCalledWith(
      'aiKnowledgeBase:list?paginate=false&filter%5Benabled%5D=true',
      { method: 'GET' },
    );
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

    expect(request).toHaveBeenNthCalledWith(1, 'ai/llmServices:list', {
      method: 'GET',
    });
    expect(request).toHaveBeenNthCalledWith(2, 'ai/ai:listLLMProviders', {
      method: 'GET',
    });
    expect(request).toHaveBeenNthCalledWith(
      3,
      'ai/llmServices:update?key=deepseek%2Fchat',
      {
        method: 'PUT',
        body: JSON.stringify({ enabled: true }),
      },
    );
    expect(request).toHaveBeenNthCalledWith(4, 'ai/ai:listProviderModels', {
      method: 'POST',
      body: JSON.stringify({ llmService: 'deepseek', search: 'chat model' }),
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
