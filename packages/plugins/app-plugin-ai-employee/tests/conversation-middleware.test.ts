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
  it('persists appended domain messages directly and formats them only for the model', async () => {
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
    const add = vi.fn().mockResolvedValue(undefined);
    const formatMessages = vi.fn().mockResolvedValue([formattedMessage]);
    const convertToolMessage = vi.fn().mockReturnValue(storedToolMessage);
    const options = {
      providerName: 'test-provider',
      model: 'test-model',
      provider: {},
    };
    const middleware = conversationMiddleware(
      {
        conversation: {
          identity: { sessionId: 'sub-session' },
          messages: { add },
        },
        chatContext: {
          formatMessages,
          convertToolMessage,
        },
        tools: {},
      } as never,
      options as never,
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
      runtime: {
        context: { appendMessages: [appendedMessage] },
      },
    };
    const handler = vi.fn().mockResolvedValue('done');

    await expect(wrapModelCall(request, handler)).resolves.toBe('done');

    expect(convertToolMessage).toHaveBeenCalledWith(toolMessage, options);
    expect(add).toHaveBeenCalledWith([storedToolMessage, appendedMessage]);
    expect(formatMessages).toHaveBeenCalledWith([appendedMessage], options);
    expect(request.messages).toEqual([toolMessage, formattedMessage]);
    expect(request.runtime.context).not.toHaveProperty('appendMessages');
    expect(handler).toHaveBeenCalledWith(request);
  });
});
