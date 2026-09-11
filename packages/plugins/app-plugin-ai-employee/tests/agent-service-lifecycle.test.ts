import { AIMessage } from '@langchain/core/messages';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '@nocobase/ai-employee';
import { AgentService } from '../server/agent/agent-service.js';
import { createTestConversationProvider } from './test-conversation-provider.js';
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
    conversation: createTestConversationProvider(),
    logger: { warn: vi.fn(), error: vi.fn() } as never,
    chatContext: {
      currentConversation: vi.fn(() => ({ sessionId: 'test-session' })),
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
      discoveredTools: vi.fn(async () => ({
        tools: new Map(),
        activeTools: async () => new Set(),
      })),
    },
    converters: {
      formatMessages: vi.fn(async (messages) => messages),
      assistant: { convert: vi.fn() },
      human: { convert: vi.fn() },
      tool: { convert: vi.fn() },
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
    'does not depend on an invoke LLM dispose hook on the %s path',
    async (mode) => {
      const dispose = vi.fn();
      const controller = new AbortController();
      const providers = createProviders(dispose, mode, () =>
        controller.abort(),
      );
      const saveAssistantMessage = vi.spyOn(
        providers.conversation.messages,
        'saveAssistantMessage',
      );
      const service = new AgentService(providers);
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
      expect(dispose).not.toHaveBeenCalled();
      if (mode === 'abort') {
        expect(saveAssistantMessage).not.toHaveBeenCalled();
      }
    },
  );

  it('cleans up every stream resource when preparation fails', async () => {
    const dispose = vi.fn();
    const providers = createProviders(dispose, 'failure');
    const unregisterAbortHandle = vi.spyOn(
      providers.conversation.abort,
      'unregisterAbortHandle',
    );
    const afterExecution = vi.spyOn(
      providers.conversation.event,
      'afterExecution',
    );
    const clearStreamCache = vi.spyOn(
      providers.conversation.streamCache,
      'clear',
    );
    const service = new AgentService(providers);
    const stream = service.stream();
    await expect(stream.next()).rejects.toThrow('prepare failed');
    expect(unregisterAbortHandle).toHaveBeenCalledOnce();
    expect(afterExecution).toHaveBeenCalledOnce();
    expect(clearStreamCache).toHaveBeenCalledTimes(2);
    expect(dispose).not.toHaveBeenCalled();
  });
});
