import { HumanMessage } from '@langchain/core/messages';
import { FakeStreamingChatModel } from '@langchain/core/utils/testing';
import { MemorySaver } from '@langchain/langgraph';
import { createAgent } from 'langchain';
import { describe, expect, it, vi } from 'vitest';

import type { LLMProvider } from '../../llm-providers/provider.js';
import type { AIEmployee } from '../ai-employee.js';
import { conversationMiddleware } from '../middleware/conversation.js';

describe('conversationMiddleware', () => {
  it('persists only the current user message when a failed checkpoint contains history', async () => {
    const addMessages = vi.fn().mockResolvedValue([]);
    const conversation = {
      getMessage: vi.fn().mockResolvedValue(null),
      removeMessages: vi.fn().mockResolvedValue(undefined),
      addMessages,
    };
    const aiEmployee = {
      sessionId: 'failed-conversation',
      userMessageCount: 1,
      aiChatConversation: {
        withTransaction: vi.fn(async (callback) => callback(conversation, {})),
      },
      updateThread: vi.fn().mockResolvedValue(undefined),
      removeAbortController: vi.fn(),
    } as unknown as AIEmployee;
    const middleware = conversationMiddleware(aiEmployee, {
      providerName: 'openai',
      provider: {} as LLMProvider,
      model: 'test-model',
      agentThread: { sessionId: 'failed-conversation', thread: 1 },
    });
    const agent = createAgent({
      model: new FakeStreamingChatModel({
        thrownErrorString: 'invalid attachment',
      }),
      tools: [],
      middleware: [middleware],
      checkpointer: new MemorySaver(),
    });
    const config = {
      configurable: { thread_id: 'failed-conversation:1' },
      context: { ctx: {}, appendMessage: undefined },
    };

    await agent.updateState(config, {
      messages: [
        new HumanMessage({
          id: 'historical-user-message',
          content: 'historical',
          additional_kwargs: {
            userContent: { type: 'text', content: 'historical' },
          },
        }),
      ],
      lastMessageIndex: {
        lastHumanMessageIndex: 0,
        lastAIMessageIndex: 0,
        lastToolMessageIndex: 0,
        lastMessageIndex: 0,
      },
    });

    for (const [id, content] of [
      ['first-current-user-message', 'first current'],
      ['second-current-user-message', 'second current'],
    ]) {
      await expect(
        agent.invoke(
          {
            messages: [
              new HumanMessage({
                id,
                content,
                additional_kwargs: { userContent: { type: 'text', content } },
              }),
            ],
          },
          config,
        ),
      ).rejects.toThrow('invalid attachment');
    }

    expect(addMessages).toHaveBeenCalledTimes(2);
    expect(addMessages.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        content: { type: 'text', content: 'first current' },
        metadata: expect.objectContaining({ id: 'first-current-user-message' }),
      }),
    ]);
    expect(addMessages.mock.calls[1][0]).toEqual([
      expect.objectContaining({
        content: { type: 'text', content: 'second current' },
        metadata: expect.objectContaining({
          id: 'second-current-user-message',
        }),
      }),
    ]);
  });
});
