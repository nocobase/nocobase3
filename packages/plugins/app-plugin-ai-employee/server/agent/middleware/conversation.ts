/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 */

import {
  coerceMessageLikeToMessage,
  type BaseMessageLike,
} from '@langchain/core/messages';
import {
  AIMessage,
  createMiddleware,
  HumanMessage,
  ToolMessage,
} from 'langchain';
import z from 'zod';
import type {
  AgentMessageConversionContext,
  AgentProviders,
  AgentThread,
} from '../types.js';
import type {
  AIMessage as AIConversationMessage,
  AIToolCall,
  AIToolMessage,
  AIMessageInput,
} from '@nocobase/ai-employee';
import type { ToolsEntity } from '@nocobase/ai-employee';

import { willInterruptToolCall } from './tools.js';
import type { Logger } from '@nocobase/logging';
export const conversationMiddleware = (
  providers: Pick<AgentProviders, 'conversation' | 'chatMessageConverters'>,
  options: AgentMessageConversionContext & {
    messageId?: string;
    agentThread?: AgentThread;
    toolMap: ReadonlyMap<string, ToolsEntity>;
  },
  logger: Logger,
) => {
  const { conversation, chatMessageConverters } = providers;
  const { messageId, agentThread, toolMap } = options;
  const identity = conversation.identity;
  const convertAssistantMessage = (message: AIMessage) =>
    chatMessageConverters.assistant.convert(message, options);
  const convertHumanMessage = (message: HumanMessage) =>
    chatMessageConverters.human.convert(message, options);
  const convertToolMessage = (message: ToolMessage) =>
    chatMessageConverters.tool.convert(message, options);

  const fillToolCalls = (
    message: AIConversationMessage,
    toolsMap: ReadonlyMap<string, ToolsEntity>,
    initializedToolCalls: AIToolMessage[],
    toolCalls: AIToolCall[],
  ) => {
    const initializedToolCallMap = new Map(
      initializedToolCalls.map((item) => [item.toolCallId, item]),
    );
    for (const toolCall of toolCalls) {
      const tool = toolsMap.get(toolCall.name);
      const initialized = initializedToolCallMap.get(toolCall.id);
      toolCall.sessionId = message.sessionId;
      toolCall.messageId = message.messageId;
      toolCall.status = initialized?.status;
      toolCall.content = initialized?.content;
      toolCall.invokeStatus = initialized?.invokeStatus;
      toolCall.invokeStartTime = initialized?.invokeStartTime;
      toolCall.invokeEndTime = initialized?.invokeEndTime;
      toolCall.auto = initialized?.auto;
      toolCall.execution = initialized?.execution;
      toolCall.willInterrupt = willInterruptToolCall(tool);
      toolCall.defaultPermission = tool?.defaultPermission;
    }
  };

  return createMiddleware({
    name: 'ConversationMiddleware',
    contextSchema: z.object({
      ctx: z.any().optional(),
      appendMessages: z.array(z.any()).optional(),
      agentRequest: z.any().optional(),
    }),
    stateSchema: z.object({
      messageId: z.coerce.string().optional(),
      lastMessageIndex: z
        .object({
          lastHumanMessageIndex: z.number().default(0),
          lastAIMessageIndex: z.number().default(0),
          lastToolMessageIndex: z.number().default(0),
          lastMessageIndex: z.number().default(0),
        })
        .default({
          lastHumanMessageIndex: 0,
          lastAIMessageIndex: 0,
          lastToolMessageIndex: 0,
          lastMessageIndex: 0,
        }),
    }),
    beforeAgent: async (state, runtime) => {
      const humanMessages = state.messages.filter(
        (message) => message.type === 'human',
      );
      const currentHumanMessageIndex = humanMessages.length;
      const agentRequest = runtime.context?.agentRequest;
      const userMessageCount = agentRequest
        ? (agentRequest.userMessages ?? []).filter(
            (message: AIMessageInput) => message.role === 'user',
          ).length
        : humanMessages.length;
      const userMessages = (
        await Promise.all(
          (userMessageCount ? humanMessages.slice(-userMessageCount) : []).map(
            (message) => convertHumanMessage(message as HumanMessage),
          ),
        )
      ).filter((message): message is AIMessageInput => message !== null);
      await conversation.messages.saveUserMessages(
        userMessages,
        messageId,
        agentThread,
      );
      return {
        lastMessageIndex: {
          ...state.lastMessageIndex,
          lastHumanMessageIndex: currentHumanMessageIndex,
        },
      };
    },
    beforeModel: async (state, runtime) => {
      const currentMessageId = state.messageId;
      const toolMessages = (
        await Promise.all(
          state.messages
            .filter((message) => message.type === 'tool')
            .slice(state.lastMessageIndex.lastToolMessageIndex)
            .map((message) => convertToolMessage(message as ToolMessage)),
        )
      ).filter((message): message is AIMessageInput => message !== null);
      if (!toolMessages.length || !currentMessageId) return;
      await conversation.messages.saveToolMessages(
        currentMessageId,
        toolMessages,
      );
      runtime.writer?.({
        action: 'beforeSendToolMessage',
        body: { messageId: currentMessageId, messages: toolMessages },
        currentConversation: identity,
      });
    },
    afterModel: async (state, runtime) => {
      try {
        const nextState = {
          messageId: state.messageId,
          lastMessageIndex: {
            lastHumanMessageIndex: state.messages.filter(
              (message) => message.type === 'human',
            ).length,
            lastAIMessageIndex: state.messages.filter(
              (message) => message.type === 'ai',
            ).length,
            lastToolMessageIndex: state.messages.filter(
              (message) => message.type === 'tool',
            ).length,
            lastMessageIndex: state.messages.length,
          },
        };
        const lastMessage = state.messages.at(-1);
        if (lastMessage?.type !== 'ai' || runtime.signal?.aborted)
          return nextState;
        const aiMessage = lastMessage as AIMessage;
        const values = await convertAssistantMessage(aiMessage);
        if (!values) return nextState;
        const saved = await conversation.messages.saveAssistantMessage(
          values,
          toolMap,
        );
        nextState.messageId = saved.message.messageId;
        const toolCalls = saved.message.toolCalls ?? [];
        if (toolCalls.length) {
          fillToolCalls(
            saved.message,
            toolMap,
            saved.initializedToolCalls,
            toolCalls,
          );
          runtime.writer?.({
            action: 'initToolCalls',
            body: { toolCalls },
            currentConversation: identity,
          });
        }
        runtime.writer?.({
          action: 'AfterAIMessageSaved',
          body: { id: aiMessage.id, messageId: nextState.messageId },
          currentConversation: identity,
        });
        return nextState;
      } catch (error) {
        logger.error(error);
      }
    },
    wrapModelCall: async (request, handler) => {
      const appendMessages = request.runtime.context?.appendMessages;
      if (Array.isArray(appendMessages) && appendMessages.length) {
        const formattedMessages = await chatMessageConverters.formatMessages(
          appendMessages,
          options,
        );
        const currentMessageId = request.state.messageId;
        const toolMessage = await convertToolMessage(
          request.messages.at(-1) as ToolMessage,
        );
        if (!currentMessageId || !toolMessage) {
          throw new Error(
            'Cannot persist appended messages without the current tool message',
          );
        }
        await conversation.messages.saveToolMessages(currentMessageId, [
          toolMessage,
        ]);
        await conversation.messages.saveUserMessages(appendMessages);
        request.messages.push(
          ...formattedMessages.map((message) =>
            coerceMessageLikeToMessage(message as BaseMessageLike),
          ),
        );
        delete request.runtime.context.appendMessages;
      }
      return handler(request);
    },
  });
};
