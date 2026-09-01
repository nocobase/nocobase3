/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 */

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

export const conversationMiddleware = (
  providers: AgentProviders,
  options: AgentMessageConversionContext & {
    messageId?: string;
    agentThread?: AgentThread;
  },
) => {
  const { conversation, chatContext, tools } = providers;
  const { messageId, agentThread } = options;
  const identity = conversation.identity;
  const convertAIMessage = (message: AIMessage) =>
    chatContext.convertAIMessage(message, options);
  const convertHumanMessage = (message: HumanMessage) =>
    chatContext.convertHumanMessage(message, options);
  const convertToolMessage = (message: ToolMessage) =>
    chatContext.convertToolMessage(message, options);

  const fillToolCalls = (
    message: AIConversationMessage,
    toolsMap: Map<string, ToolsEntity>,
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
      toolCall.willInterrupt = tools.shouldInterruptToolCall(tool);
      toolCall.defaultPermission = tool?.defaultPermission;
    }
  };

  return createMiddleware({
    name: 'ConversationMiddleware',
    contextSchema: z.object({
      ctx: z.any().optional(),
      appendMessage: z.any().optional(),
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
      const userMessageCount = runtime.context?.agentRequest
        ? chatContext.getUserMessageCount(runtime.context.agentRequest)
        : humanMessages.length;
      const userMessages = (
        userMessageCount ? humanMessages.slice(-userMessageCount) : []
      )
        .map((message) => convertHumanMessage(message as HumanMessage))
        .filter((message): message is AIMessageInput => message !== null);
      await conversation.messages.saveUserMessages(
        messageId,
        userMessages,
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
      const toolMessages = state.messages
        .filter((message) => message.type === 'tool')
        .slice(state.lastMessageIndex.lastToolMessageIndex)
        .map((message) => convertToolMessage(message as ToolMessage))
        .filter((message): message is AIMessageInput => message !== null);
      if (!toolMessages.length || !currentMessageId) return;
      for (const message of toolMessages)
        message.metadata.messageId = currentMessageId;
      await conversation.messages.saveToolMessages(
        toolMessages,
        currentMessageId,
        toolMessages.map((message) => message.metadata.toolCallId as string),
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
        const toolCalls = (aiMessage.tool_calls ?? []) as AIToolCall[];
        const values = convertAIMessage(aiMessage);
        if (!values) return nextState;
        const saved = await conversation.messages.saveAssistantMessage(
          values,
          toolCalls,
        );
        nextState.messageId = saved.message.messageId;
        if (toolCalls.length) {
          fillToolCalls(
            saved.message,
            await tools.getToolsMap(),
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
        conversation.logger.error(error);
      }
    },
    wrapModelCall: async (request, handler) => {
      const appendMessage = request.runtime.context?.appendMessage;
      if (Array.isArray(appendMessage) && appendMessage.length) {
        const messages = [
          convertToolMessage(request.messages.at(-1) as ToolMessage),
          ...appendMessage.map((message) =>
            convertHumanMessage(message as HumanMessage),
          ),
        ].filter((message): message is AIMessageInput => message !== null);
        await conversation.messages.add(messages);
        request.messages.push(...appendMessage);
        delete request.runtime.context.appendMessage;
      }
      return handler(request);
    },
  });
};
