/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import {
  createMiddleware,
  humanInTheLoopMiddleware,
  ToolMessage,
} from 'langchain';
import { AIEmployee } from '../ai-employee.js';
import z from 'zod';
import { beginAIToolAttempt } from '../../audit-runtime.js';
import _ from 'lodash';
import type { ToolsEntity } from '@nocobase/ai-employee';

export const toolInteractionMiddleware = (
  aiEmployee: AIEmployee,
  tools: ToolsEntity[],
): ReturnType<typeof createMiddleware> => {
  const interruptOn: Parameters<
    typeof humanInTheLoopMiddleware
  >[0]['interruptOn'] = {};
  for (const tool of tools) {
    interruptOn[tool.definition.name] = aiEmployee.shouldInterruptToolCall(tool)
      ? {
          allowedDecisions: ['approve', 'reject', 'edit'],
          description: (toolCall) =>
            JSON.stringify({
              sessionId: aiEmployee.sessionId,
              from: aiEmployee.from,
              username: aiEmployee.employee.username,
              toolCallId: toolCall.id,
              toolCallName: toolCall.name,
            }),
        }
      : false;
  }
  return humanInTheLoopMiddleware({
    interruptOn,
  });
};

export const toolCallStatusMiddleware = (
  aiEmployee: AIEmployee,
): ReturnType<typeof createMiddleware> => {
  return createMiddleware({
    name: 'ToolCallStatusMiddleware',
    stateSchema: z.object({
      messageId: z.coerce.string().optional(),
    }),
    wrapToolCall: async (request, handler) => {
      let interrupted = false;
      const { runtime, toolCall } = request;
      const { messageId } = request.state;
      if (!messageId) {
        throw new Error('Tool call messageId is required');
      }
      const toolCallId = toolCall.id;
      if (typeof toolCallId !== 'string') {
        throw new Error('Tool call id is required');
      }
      const currentConversation = {
        sessionId: aiEmployee.sessionId,
        username: aiEmployee.employee.username,
        from: aiEmployee.from,
      };

      const tm = await aiEmployee.getToolCallResult(messageId, toolCallId);
      if (!tm) {
        throw new Error(
          `Tool call result not found for messageId=${messageId}, toolCallId=${toolCallId}`,
        );
      }
      if (tm.status === 'error') {
        runtime.writer?.({
          action: 'afterToolCall',
          body: { toolCall, toolCallResult: tm },
          currentConversation,
        });
        return new ToolMessage({
          tool_call_id: toolCallId,
          status: 'error',
          content: tm.content,
          metadata: {
            messageId,
          },
        });
      }

      await aiEmployee.updateToolCallPending(messageId, toolCallId);
      runtime.writer?.({
        action: 'beforeToolCall',
        body: { toolCall },
        currentConversation,
      });
      const finishAttempt = await beginAIToolAttempt(toolCall.name, aiEmployee);
      let attemptOutcome: 'success' | 'failed' | 'accepted' = 'failed';
      let result;
      try {
        const toolMessage = await handler(request);
        if (toolMessage instanceof ToolMessage) {
          if (_.isObject(toolMessage.content)) {
            result = toolMessage.content;
          } else if (typeof toolMessage.content === 'string') {
            try {
              result = JSON.parse(toolMessage.content);
            } catch {
              aiEmployee.logger.warn({ code: 'AI_TOOL_RESULT_NOT_JSON' });
              result = toolMessage.content;
            }
          } else {
            // Preserve non-string tool content.
            result = toolMessage.content;
          }
        } else {
          result = toolMessage;
        }

        attemptOutcome =
          (toolMessage instanceof ToolMessage &&
            toolMessage.status === 'error') ||
          result?.status === 'error'
            ? 'failed'
            : 'success';
        return toolMessage;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof Error && error.name === 'GraphInterrupt') {
          interrupted = true;
          attemptOutcome = 'accepted';
          throw error;
        }
        aiEmployee.logger.error({ code: 'AI_TOOL_EXECUTION_FAILED' });
        result = { status: 'error', content: message };
        runtime.writer?.({
          action: 'afterToolCallError',
          body: { toolCall, error },
          currentConversation,
        });
        return new ToolMessage({
          tool_call_id: toolCallId,
          status: 'error',
          content: message,
          metadata: {
            messageId,
          },
        });
      } finally {
        await finishAttempt?.(attemptOutcome);
        if (!interrupted) {
          await aiEmployee.updateToolCallDone(messageId, toolCallId, result);
          const toolCallResult = await aiEmployee.getToolCallResult(
            messageId,
            toolCallId,
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
