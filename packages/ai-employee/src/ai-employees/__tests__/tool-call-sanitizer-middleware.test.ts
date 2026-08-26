import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { MemorySaver } from '@langchain/langgraph';
import { convertMessagesToCompletionsMessageParams } from '@langchain/openai';
import { createAgent } from 'langchain';
import { describe, expect, it, vi } from 'vitest';

import { toolCallSanitizerMiddleware } from '../middleware/tool-call-sanitizer.js';

const rawToolCall = {
  id: 'call_bad',
  type: 'function',
  function: {
    name: 'aiEmployeeWorkflowTaskOutput',
    arguments: '{"result":{"reference_reply":":"bad json"}',
  },
};

type MessagePatchHook = (state: {
  messages: BaseMessage[];
}) =>
  | void
  | { messages?: BaseMessage[] }
  | Promise<void | { messages?: BaseMessage[] }>;

function getMessagePatchHook(hook: unknown): MessagePatchHook {
  if (typeof hook === 'function') return hook as MessagePatchHook;
  if (
    hook &&
    typeof hook === 'object' &&
    'hook' in hook &&
    typeof (hook as any).hook === 'function'
  ) {
    return (hook as any).hook as MessagePatchHook;
  }
  throw new Error('Middleware hook is not callable');
}

function getPatchMessages(
  result: Awaited<ReturnType<MessagePatchHook>>,
): BaseMessage[] {
  return result && 'messages' in result ? (result.messages ?? []) : [];
}

describe('toolCallSanitizerMiddleware', () => {
  it('removes malformed raw tool calls before checkpoint persistence and the next request', async () => {
    const model = new FakeListChatModel({
      responses: [
        new AIMessage({
          id: 'ai_bad',
          content: '',
          additional_kwargs: {
            tool_calls: [rawToolCall],
            reasoning_content: 'keep this reasoning',
          },
        }),
      ],
    });
    const logger = { warn: vi.fn() };
    const agent = createAgent({
      model,
      tools: [],
      middleware: [toolCallSanitizerMiddleware({ logger })],
      checkpointer: new MemorySaver(),
    });
    const config = { configurable: { thread_id: 'malformed-tool-call' } };

    await agent.invoke(
      { messages: [{ role: 'user', content: 'run' }] },
      config,
    );

    const state = await agent.getState(config);
    const lastMessage = state.values.messages.at(-1) as AIMessage;
    expect(lastMessage.tool_calls).toEqual([]);
    expect(lastMessage.invalid_tool_calls).toHaveLength(1);
    expect(lastMessage.additional_kwargs).toEqual({
      reasoning_content: 'keep this reasoning',
    });
    const requestMessages = convertMessagesToCompletionsMessageParams({
      messages: state.values.messages,
    });
    expect(requestMessages.at(-1)).not.toHaveProperty('tool_calls');
    expect(logger.warn).toHaveBeenCalledWith(
      'Discard malformed raw tool calls from AI message',
      expect.objectContaining({
        phase: 'afterModel',
        messageId: 'ai_bad',
        rawToolCallIds: ['call_bad'],
        rawToolCallNames: ['aiEmployeeWorkflowTaskOutput'],
      }),
    );
    expect(JSON.stringify(logger.warn.mock.calls[0][1])).not.toContain(
      'reference_reply',
    );
  });

  it('builds a replacement patch without mutating or replacing non-AI messages', async () => {
    const badAIMessage = new AIMessage({
      id: 'ai_bad_middle',
      content: '',
      additional_kwargs: {
        tool_calls: [rawToolCall],
        reasoning_content: 'keep this reasoning',
      },
    });
    const humanMessage = new HumanMessage({
      id: 'human_1',
      content: 'continue',
    });
    const toolMessage = new ToolMessage({
      id: 'tool_1',
      content: 'tool result',
      tool_call_id: 'call_existing',
    });
    const middleware = toolCallSanitizerMiddleware();
    const beforeModel = getMessagePatchHook(middleware.beforeModel);
    const messages = [humanMessage, badAIMessage, toolMessage];

    const patchMessages = getPatchMessages(await beforeModel({ messages }));

    expect(messages).toEqual([humanMessage, badAIMessage, toolMessage]);
    expect(patchMessages).toHaveLength(1);
    expect(patchMessages[0]).not.toBe(badAIMessage);
    expect(AIMessage.isInstance(patchMessages[0])).toBe(true);
    expect(patchMessages[0].id).toBe(badAIMessage.id);
    expect(badAIMessage.additional_kwargs).toEqual({
      reasoning_content: 'keep this reasoning',
    });
  });
});
