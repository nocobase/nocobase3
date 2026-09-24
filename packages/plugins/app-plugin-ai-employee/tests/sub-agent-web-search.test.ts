import {
  AIManager,
  LLMProvider,
  MemoryRepositoryFactory,
} from '@nocobase/ai-employee';
import { describe, expect, it, vi } from 'vitest';

import subAgentWebSearch from '../server/ai/tools/subAgentWebSearch.js';

/**
 * The tool is only as good as the provider behind it. A provider with no
 * built-in search silently ignores the flag, so without this check the tool
 * hands a retrieval prompt to an ordinary model and reports success.
 */
async function invokeWithProvider(
  provider: string,
  model = 'some-model',
): Promise<{ status: string; content: unknown }> {
  const ai = new AIManager({ repositories: new MemoryRepositoryFactory() });
  ai.llmProviderManager.registerLLMProvider('searching', {
    title: 'Searching',
    provider: class {} as never,
    supportWebSearch: true,
  });
  ai.llmProviderManager.registerLLMProvider('plain', {
    title: 'Plain',
    provider: class {} as never,
  });
  ai.llmProviderManager.registerLLMProvider('picky', {
    title: 'Picky',
    provider: class {} as never,
    supportWebSearch: true,
    webSearchModels: ['picky-pro'],
  });
  await ai.llmServiceManager.registerLLMService({
    name: 'service',
    provider,
    enabledModels: [model],
  });

  return (await subAgentWebSearch.invoke(
    {
      deps: { ai },
      actor: { id: 1, roles: [], isRoot: false },
      state: { sessionId: 's', model: { llmService: 'service', model } },
      runtime: { logger: console as never },
    } as never,
    { query: ['who makes this'] },
    { toolCallId: 't', writer: () => {} } as never,
  )) as { status: string; content: unknown };
}

describe('subAgentWebSearch', () => {
  it('refuses on a provider without built-in web search', async () => {
    const result = await invokeWithProvider('plain');
    expect(result.status).toBe('error');
    expect(String(result.content)).toContain('no built-in web search');
  });

  it('refuses a model its provider does not search with', async () => {
    const result = await invokeWithProvider('picky', 'picky-lite');
    expect(result.status).toBe('error');
    expect(String(result.content)).toContain('picky-pro');
  });

  it('refuses when the named service is not configured', async () => {
    const ai = new AIManager({ repositories: new MemoryRepositoryFactory() });
    const result = (await subAgentWebSearch.invoke(
      {
        deps: { ai },
        actor: { id: 1, roles: [], isRoot: false },
        state: { sessionId: 's', model: { llmService: 'gone', model: 'm' } },
        runtime: { logger: console as never },
      } as never,
      { query: ['anything'] },
      { toolCallId: 't', writer: () => {} } as never,
    )) as { status: string; content: unknown };
    expect(result.status).toBe('error');
    expect(String(result.content)).toContain('not configured');
  });

  it('gets past the capability check on a searching provider', async () => {
    // The provider class is a stub, so execution fails after the check rather
    // than before it. Reaching that failure is what proves the check passed.
    await expect(invokeWithProvider('searching')).rejects.toThrow();
  });

  it('sends each query to the model on its own, with only the built-in search bound', async () => {
    const calls: {
      tools: unknown[];
      messages: { role: string; content: string }[];
      options: { tags?: string[] };
    }[] = [];
    const created: { reasoning: unknown; builtIn: unknown }[] = [];
    class SearchingProvider extends LLMProvider {
      public createModel() {
        created.push({
          reasoning: this.modelReasoningOptions,
          builtIn: this.modelOptions?.builtIn,
        });
        return {
          bindTools: (tools: unknown[]) => ({
            invoke: vi.fn(
              async (
                messages: { role: string; content: string }[],
                options: { tags?: string[] },
              ) => {
                calls.push({ tools, messages, options });
                return { text: `found: ${messages.at(-1)?.content}` };
              },
            ),
          }),
        };
      }

      protected builtInTools(): unknown[] {
        return this.modelOptions?.builtIn?.webSearch === true
          ? [{ type: 'web_search' }]
          : [];
      }
    }
    const ai = new AIManager({ repositories: new MemoryRepositoryFactory() });
    ai.llmProviderManager.registerLLMProvider('searching', {
      title: 'Searching',
      provider: SearchingProvider,
      supportWebSearch: true,
    });
    await ai.llmServiceManager.registerLLMService({
      name: 'service',
      provider: 'searching',
      enabledModels: ['some-model'],
    });

    const result = (await subAgentWebSearch.invoke(
      {
        deps: { ai },
        actor: { id: 1, roles: [], isRoot: false },
        state: {
          sessionId: 's',
          model: { llmService: 'service', model: 'some-model' },
        },
        runtime: { logger: console as never },
      } as never,
      { query: ['first query', 'second query'] },
      { toolCallId: 't', writer: () => {} } as never,
    )) as { status: string; content: unknown };

    expect(created).toEqual([
      { reasoning: { mode: 'off' }, builtIn: { webSearch: true } },
    ]);
    expect(calls).toHaveLength(2);
    for (const [index, query] of ['first query', 'second query'].entries()) {
      const call = calls[index];
      expect(call?.tools).toEqual([{ type: 'web_search' }]);
      expect(call?.messages).toHaveLength(2);
      expect(call?.messages[0]?.role).toBe('system');
      expect(call?.messages[0]?.content).toContain(
        'You are a web search retrieval assistant.',
      );
      expect(call?.messages[1]).toEqual({ role: 'user', content: query });
      expect(call?.options.tags).toEqual(['langsmith:nostream']);
    }
    expect(result).toEqual({
      status: 'success',
      content: [
        { query: 'first query', result: 'found: first query' },
        { query: 'second query', result: 'found: second query' },
      ],
    });
  });
});
