import { AIMessage } from '@langchain/core/messages';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '@nocobase/ai-employee';
import { AgentService } from '../server/agent/agent-service.js';
import { createMemoryConversationProvider } from '../server/agent/providers.js';
import type {
  AgentProviders,
  ResolvedAgentLLM,
} from '../server/agent/types.js';

type LifecycleMode = 'success' | 'failure' | 'abort' | 'interrupt';

const createProviders = (
  dispose: ReturnType<typeof vi.fn>,
  mode: LifecycleMode,
  abort?: () => void,
): AgentProviders => {
  const provider = {
    createModel: () =>
      new FakeListChatModel({ responses: [new AIMessage('completed')] }),
    resolveTools: () => [],
    parseResponseError: (error) => (error as Error).message,
  } as unknown as LLMProvider;
  const llm: ResolvedAgentLLM = {
    providerName: 'test',
    model: 'test',
    provider,
    dispose,
  };
  return {
    conversation: createMemoryConversationProvider(),
    chatContext: {
      resolveLLM: vi.fn(async () => llm),
      getSystemPrompt: vi.fn(async () => {
        if (mode === 'failure') throw new Error('prepare failed');
        if (mode === 'abort') {
          abort?.();
          throw new Error('stopped');
        }
        if (mode === 'interrupt') {
          const error = new Error('waiting for input');
          error.name = 'GraphInterrupt';
          throw error;
        }
        return undefined;
      }),
      discoveredTools: vi.fn(async () => []),
      activeTools: vi.fn(async () => new Set()),
      getExecutionConfig: vi.fn(async () => ({})),
      shouldInterruptToolCall: vi.fn(() => false),
      getToolsMap: vi.fn(async () => new Map()),
    },
    chatMessageConverters: {
      formatMessages: vi.fn(async (messages) => messages),
      assistant: { toStored: vi.fn() },
      human: { toStored: vi.fn() },
      tool: { toStored: vi.fn() },
    },
    features: {
      contextEnrichment: true,
      skills: true,
      tools: true,
      toolInteraction: true,
      toolCallStatus: true,
      conversationPersistence: true,
      toolCallSanitizer: true,
      knowledgeBase: true,
      subAgents: true,
    },
  };
};

describe('AgentService execution-local LLM lifecycle', () => {
  it.each(['success', 'failure', 'abort', 'interrupt'] as const)(
    'disposes an invoke LLM on the %s path',
    async (mode) => {
      const dispose = vi.fn();
      const controller = new AbortController();
      const service = new AgentService(
        createProviders(dispose, mode, () => controller.abort()),
      );
      const execution = service.invoke({
        signal: controller.signal,
        userMessages: [
          { role: 'user', content: { type: 'text', content: 'hello' } },
        ],
      });
      if (mode === 'success') await expect(execution).resolves.toBeDefined();
      else if (mode === 'abort')
        await expect(execution).rejects.toMatchObject({ code: 'ABORTED' });
      else if (mode === 'interrupt')
        await expect(execution).rejects.toMatchObject({
          name: 'GraphInterrupt',
        });
      else await expect(execution).rejects.toThrow('Agent execution failed');
      expect(dispose).toHaveBeenCalledOnce();
    },
  );

  it('disposes a resolved LLM when stream preparation fails', async () => {
    const dispose = vi.fn();
    const service = new AgentService(createProviders(dispose, 'failure'));
    const stream = service.stream();
    await expect(stream.next()).rejects.toThrow('prepare failed');
    expect(dispose).toHaveBeenCalledOnce();
  });
});
