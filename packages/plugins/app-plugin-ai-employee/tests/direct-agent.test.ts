import { AIMessage } from '@langchain/core/messages';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '@nocobase/ai-employee';
import { createDirectAgentService } from '../server/agent/direct.js';
import { createMemoryConversationProvider } from '../server/agent/providers.js';

const createLLMProvider = (content = 'done'): LLMProvider =>
  ({
    modelOptions: { model: 'fake-model' },
    createModel: () =>
      new FakeListChatModel({ responses: [new AIMessage(content)] }),
    resolveTools: () => [],
    parseReasoningContent: () => null,
    parseResponseChunk: (value) => value,
    parseWebSearchAction: () => [],
    parseResponseError: (error) => (error as Error).message,
    prepareStoredAssistantAdditionalKwargs: (value) => value,
  }) as unknown as LLMProvider;

describe('direct AgentService', () => {
  it('invokes without AIEmployee records or database services', async () => {
    const service = createDirectAgentService({
      llmProvider: createLLMProvider('hello'),
      systemPrompt: 'You are direct.',
    });
    const result = (await service.invoke({
      userMessages: [
        {
          role: 'user',
          content: { type: 'text', content: 'Hi' },
          metadata: {},
        } as any,
      ],
    })) as any;
    expect(result.messages.at(-1).content).toBe('hello');
  });

  it('uses a custom history loader while retaining default persistence and tool-call stores', async () => {
    const conversation = createMemoryConversationProvider({
      sessionId: 'custom',
    });
    const load = vi.fn(async () => []);
    const service = createDirectAgentService({
      llmProvider: createLLMProvider(),
      conversation,
      conversationOverrides: { messages: { load } },
    });
    await service.invoke({
      messageId: '2',
      userMessages: [
        {
          role: 'user',
          content: { type: 'text', content: 'Hi' },
          metadata: {},
        } as any,
      ],
    });
    expect(load).toHaveBeenCalledWith('2');
    expect(typeof conversation.messages.saveAssistantMessage).toBe('function');
    expect(typeof conversation.toolCalls.markPending).toBe('function');
  });
});
