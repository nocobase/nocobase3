import { HumanMessage, ToolMessage } from '@langchain/core/messages';
import { describe, expect, it, vi } from 'vitest';

import { conversationMiddleware } from '../server/agent/middleware/conversation.js';

function getMiddlewareHook<T extends (...args: any[]) => any>(
  hook: unknown,
): T {
  if (typeof hook === 'function') return hook as T;
  if (
    hook &&
    typeof hook === 'object' &&
    'hook' in hook &&
    typeof (hook as { hook?: unknown }).hook === 'function'
  ) {
    return (hook as { hook: T }).hook;
  }
  throw new Error('Middleware hook is not callable');
}

describe('conversationMiddleware', () => {
  it('confirms the tool result before persisting appended domain messages', async () => {
    const appendedMessage = {
      role: 'user',
      content: { type: 'text', content: 'continue the task' },
      attachments: [{ id: 'attachment-1' }],
    };
    const storedToolMessage = {
      role: 'tool',
      content: { type: 'text', content: 'Tool call rejected' },
      metadata: { toolCallId: 'call-1' },
    };
    const formattedMessage = new HumanMessage('continue the task');
    const saveToolMessages = vi.fn().mockResolvedValue(undefined);
    const saveUserMessages = vi.fn().mockResolvedValue(undefined);
    const formatMessages = vi.fn().mockResolvedValue([formattedMessage]);
    const convertToolMessage = vi.fn().mockReturnValue(storedToolMessage);
    const options = {
      providerName: 'test-provider',
      model: 'test-model',
      provider: {},
      toolMap: new Map(),
    };
    const middleware = conversationMiddleware(
      {
        conversation: {
          messages: { saveToolMessages, saveUserMessages },
        },
        context: {
          currentConversation: () => ({ sessionId: 'sub-session' }),
        },
        converters: {
          formatMessages,
          tool: { convert: convertToolMessage },
        },
        tools: {},
      } as never,
      options as never,
      { error: vi.fn() } as never,
    );
    const wrapModelCall = getMiddlewareHook<
      (
        request: any,
        handler: (request: any) => Promise<string>,
      ) => Promise<string>
    >(middleware.wrapModelCall);
    const toolMessage = new ToolMessage({
      content: 'Tool call rejected',
      tool_call_id: 'call-1',
    });
    const request = {
      messages: [toolMessage],
      state: { messageId: 'assistant-message-1' },
      runtime: {
        context: { appendMessages: [appendedMessage] },
      },
    };
    const handler = vi.fn().mockResolvedValue('done');

    await expect(wrapModelCall(request, handler)).resolves.toBe('done');

    expect(convertToolMessage).toHaveBeenCalledWith(toolMessage, options);
    expect(saveToolMessages).toHaveBeenCalledWith('assistant-message-1', [
      storedToolMessage,
    ]);
    expect(saveUserMessages).toHaveBeenCalledWith([appendedMessage]);
    expect(saveToolMessages.mock.invocationCallOrder[0]).toBeLessThan(
      saveUserMessages.mock.invocationCallOrder[0],
    );
    expect(formatMessages).toHaveBeenCalledWith([appendedMessage], options);
    expect(request.messages).toEqual([toolMessage, formattedMessage]);
    expect(request.runtime.context).not.toHaveProperty('appendMessages');
    expect(handler).toHaveBeenCalledWith(request);
  });

  it('uses the provided tool snapshot for persistence and event policy', async () => {
    const tool = {
      scope: 'GENERAL',
      execution: 'backend',
      auto: false,
      defaultPermission: 'ASK',
      definition: { name: 'reviewTool' },
    };
    const toolMap = new Map([['reviewTool', tool]]);
    const persisted = {
      messageId: 'message-1',
      sessionId: 'session-1',
      role: 'assistant',
      content: { type: 'text', content: '' },
      toolCalls: [{ id: 'call-1', name: 'reviewTool', args: {} }],
    };
    const initialized = {
      toolCallId: 'call-1',
      auto: false,
      execution: 'backend',
      invokeStatus: 'init',
    };
    const saveAssistantMessage = vi.fn(async () => ({
      message: persisted,
      initializedToolCalls: [initialized],
    }));
    const writer = vi.fn();
    const middleware = conversationMiddleware(
      {
        conversation: {
          messages: { saveAssistantMessage },
        },
        context: {
          currentConversation: () => ({ sessionId: 'session-1' }),
        },
        converters: {
          assistant: { convert: vi.fn(async () => ({ role: 'assistant' })) },
        },
      } as never,
      { providerName: 'test', model: 'test', provider: {}, toolMap } as never,
      { error: vi.fn() } as never,
    );
    const afterModel = getMiddlewareHook<any>(middleware.afterModel);
    const aiMessage = { type: 'ai', id: 'ai-1' };

    await afterModel(
      {
        messageId: undefined,
        messages: [aiMessage],
        lastMessageIndex: {
          lastHumanMessageIndex: 0,
          lastAIMessageIndex: 0,
          lastToolMessageIndex: 0,
          lastMessageIndex: 0,
        },
      },
      { writer },
    );

    expect(saveAssistantMessage).toHaveBeenCalledWith(
      { role: 'assistant' },
      toolMap,
    );
    expect(persisted.toolCalls[0]).toMatchObject({
      auto: false,
      willInterrupt: true,
      defaultPermission: 'ASK',
    });
    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'initToolCalls',
        body: { toolCalls: persisted.toolCalls },
      }),
    );
  });
});
