import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '@nocobase/ai-employee';

import { DefaultChatMessageConverters } from '../server/agent/message/converters.js';
const prepareStoredAssistantAdditionalKwargs = vi.fn((value) => value);
const context = {
  providerName: 'test-provider',
  llmService: 'test-service',
  model: 'test-model',
  provider: {
    prepareStoredAssistantAdditionalKwargs,
    reshapeAIMessage: vi.fn(),
  } as unknown as LLMProvider,
};

describe('DefaultChatMessageConverters', () => {
  it('formats each supported stored message role', async () => {
    const converters = new DefaultChatMessageConverters();
    const messages = await converters.formatMessages(
      [
        { role: 'system', content: { type: 'text', content: 'system' } },
        { role: 'user', content: { type: 'text', content: 'user' } },
        {
          role: 'tool',
          content: { type: 'text', content: 'tool' },
          metadata: { toolCallId: 'call-1', toolName: 'search' },
        },
        {
          role: 'assistant',
          content: { type: 'text', content: 'assistant' },
          metadata: { additional_kwargs: { raw: true } },
        },
      ] as never,
      context,
    );

    expect(messages).toHaveLength(4);
    expect(messages[0]).toEqual({ role: 'system', content: 'system' });
    expect(messages[1]).toBeInstanceOf(HumanMessage);
    expect(messages[2]).toBeInstanceOf(ToolMessage);
    expect(messages[3]).toBeInstanceOf(AIMessage);
  });

  it('returns null for empty assistant and unannotated human messages', async () => {
    const converters = new DefaultChatMessageConverters();
    expect(
      await converters.assistant.convert(
        new AIMessage({ content: null as never }),
        context,
      ),
    ).toBeNull();
    expect(
      await converters.human.convert(new HumanMessage('generated'), context),
    ).toBeNull();
  });

  it('retains explicit human source data and tool identity', async () => {
    const converters = new DefaultChatMessageConverters();
    const human = await converters.human.convert(
      new HumanMessage({
        content: 'formatted',
        additional_kwargs: {
          userContent: { type: 'text', content: 'original' },
          attachments: [{ id: 'file-1' }],
          workContext: { collection: 'tasks' },
        },
      }),
      context,
    );
    const tool = await converters.tool.convert(
      new ToolMessage({
        content: 'result',
        tool_call_id: 'call-1',
        name: 'search',
      }),
      context,
    );

    expect(human).toMatchObject({
      role: 'user',
      content: { type: 'text', content: 'original' },
      attachments: [{ id: 'file-1' }],
      workContext: { collection: 'tasks' },
    });
    expect(tool.metadata).toMatchObject({
      toolCallId: 'call-1',
      toolName: 'search',
    });
  });

  it('stores assistant tool calls on the complete message input', async () => {
    const converters = new DefaultChatMessageConverters({
      employee: { username: 'dara' },
      logger: {},
      actorId: 1,
      collectionRepository: vi.fn(),
      workContextHandler: { resolve: vi.fn(async () => []) },
      fileStorage: {},
      documentLoaders: { cached: {} },
      caching: {},
      skillSettings: {},
    } as never);
    const stored = await converters.assistant.convert(
      new AIMessage({
        content: 'answer',
        tool_calls: [
          { id: 'call-1', name: 'search', args: { query: 'NocoBase' } },
        ],
      }),
      context,
    );

    expect(stored).toMatchObject({
      role: 'dara',
      toolCalls: [
        { id: 'call-1', name: 'search', args: { query: 'NocoBase' } },
      ],
    });
  });
});
