/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 */

import {
  createMiddleware,
  humanInTheLoopMiddleware,
  ToolMessage,
} from 'langchain';
import z from 'zod';
import _ from 'lodash';
import type { ConversationProvider, ToolProvider } from '../types.js';
import type { ToolsEntity } from '../../repository/tool.js';

export const toolInteractionMiddleware = (
  conversation: ConversationProvider,
  toolProvider: ToolProvider,
  tools: ToolsEntity[],
): ReturnType<typeof createMiddleware> => {
  const interruptOn = {};
  const identity = conversation.identity;
  for (const tool of tools) {
    interruptOn[tool.definition.name] = toolProvider.shouldInterruptToolCall(
      tool,
    )
      ? {
          allowedDecisions: ['approve', 'reject', 'edit'],
          description: (toolCall) =>
            JSON.stringify({
              sessionId: identity.sessionId,
              from: identity.from,
              username: identity.username,
              toolCallId: toolCall.id,
              toolCallName: toolCall.name,
            }),
        }
      : false;
  }
  return humanInTheLoopMiddleware({ interruptOn });
};

export const toolCallStatusMiddleware = (
  conversation: ConversationProvider,
): ReturnType<typeof createMiddleware> => {
  const store = conversation.toolCalls;
  return createMiddleware({
    name: 'ToolCallStatusMiddleware',
    stateSchema: z.object({ messageId: z.coerce.string().optional() }),
    wrapToolCall: async (request, handler) => {
      let interrupted = false;
      const { runtime, toolCall } = request;
      const { messageId } = request.state;
      const currentConversation = conversation.identity;
      const existing = await store.get(messageId, request.toolCall.id);
      if (!existing)
        throw new Error(
          `Tool call result not found for messageId=${messageId}, toolCallId=${request.toolCall.id}`,
        );
      if (existing.status === 'error') {
        runtime.writer?.({
          action: 'afterToolCall',
          body: { toolCall, toolCallResult: existing },
          currentConversation,
        });
        return new ToolMessage({
          tool_call_id: request.toolCall.id,
          status: 'error',
          content: existing.content,
          metadata: { messageId },
        });
      }
      await store.markPending(messageId, request.toolCall.id);
      runtime.writer?.({
        action: 'beforeToolCall',
        body: { toolCall },
        currentConversation,
      });
      let result;
      try {
        const toolMessage = await handler(request);
        if (toolMessage instanceof ToolMessage) {
          if (_.isObject(toolMessage.content)) result = toolMessage.content;
          else if (typeof toolMessage.content === 'string') {
            try {
              result = JSON.parse(toolMessage.content);
            } catch (error) {
              conversation.logger.warn({ error }, 'tool result parse fail');
              result = toolMessage.content;
            }
          } else result = toolMessage.content;
        } else result = toolMessage;
        return toolMessage;
      } catch (error: any) {
        if (error?.name === 'GraphInterrupt') {
          interrupted = true;
          throw error;
        }
        conversation.logger.error(error);
        result = { status: 'error', content: error?.message };
        await store.markError(messageId, request.toolCall.id, error);
        runtime.writer?.({
          action: 'afterToolCallError',
          body: { toolCall, error },
          currentConversation,
        });
        return new ToolMessage({
          tool_call_id: request.toolCall.id,
          status: 'error',
          content: error?.message,
          metadata: { messageId },
        });
      } finally {
        if (!interrupted) {
          if (result?.status !== 'error')
            await store.markDone(messageId, request.toolCall.id, result);
          const toolCallResult = await store.get(
            messageId,
            request.toolCall.id,
          );
          runtime.writer?.({
            action: 'afterToolCall',
            body: { toolCall, toolCallResult },
            currentConversation,
          });
        }
      }
    },
  });
};
