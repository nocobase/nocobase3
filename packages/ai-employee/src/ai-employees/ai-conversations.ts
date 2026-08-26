/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { DatabaseConnection } from '@nocobase/app-database';
import type { Context } from '../app/context.js';
import {
  AIMessage,
  AIToolCall,
  AIToolMessage,
  SubAgentConversationMetadata,
  UserDecision,
} from './types/index.js';
import { parseResponseMessage } from './server-utils.js';
import type { FrontendToolManifest } from './common/frontend-tools.js';

export type AIConversationsOptions = {
  systemMessage?: unknown;
  skillSettings?: unknown;
  conversationSettings?: unknown;
  modelSettings?: unknown;
  frontendTools?: FrontendToolManifest[];
  [key: string]: unknown;
};

export type AIConversationFilterParams = {
  filter: {
    userId: string | number;
  };
};

export type CreateAIConversationParams = {
  userId?: string | number;
  aiEmployee: { username: string };
  title?: string;
  options?: AIConversationsOptions;
  from?: 'main-agent' | 'sub-agent';
  scope?: string;
  transaction?: DatabaseConnection;
  category?: 'chat' | 'task';
};

export type UpdateAIConversationParams = {
  userId: string | number;
  sessionId: string;
  title?: string;
  options?: AIConversationsOptions;
};

export type GetAIConversationMessagesParams = {
  userId: string | number;
  sessionId: string;
  cursor?: string;
  paginate?: boolean;
  updateRead?: boolean;
};

export type ParsedMessageRow = AIMessage;

export type GetAIConversationMessagesResult = {
  rows: any[];
  hasMore?: boolean;
  cursor?: string | null;
};

export const registerAIConversationReadNotification = (
  _ctx: Context,
): void => {};

export class AIConversationsManager {
  constructor(protected ctx: Context) {}

  async create({
    userId,
    aiEmployee,
    title,
    options = {},
    from = 'main-agent',
    scope,
    transaction,
    category = 'chat',
  }: CreateAIConversationParams) {
    return await this.aiConversationsRepo.create(
      {
        values: {
          userId,
          title,
          aiEmployeeUsername: aiEmployee?.username,
          options,
          thread: 1,
          from,
          ...(scope !== undefined ? { scope } : {}),
          category,
        },
      },
      transaction ? { connection: transaction } : undefined,
    );
  }

  async update({
    userId,
    sessionId,
    title,
    options: inputOptions,
  }: UpdateAIConversationParams) {
    const conversation = await this.getConversation({
      sessionId,
      userId,
    });

    if (!conversation) {
      throw new Error('invalid sessionId');
    }

    const {
      systemMessage,
      skillSettings,
      conversationSettings,
      modelSettings,
    } = inputOptions ?? {};
    const options = conversation.options ?? {};
    if (systemMessage) {
      options['systemMessage'] = systemMessage;
    }
    if (skillSettings) {
      options['skillSettings'] = skillSettings;
    }
    if (conversationSettings) {
      options['conversationSettings'] = conversationSettings;
    }
    if (modelSettings) {
      options['modelSettings'] = modelSettings;
    }
    const values: Record<string, unknown> = { options };
    if (title) {
      values.title = title;
    }

    return await this.aiConversationsRepo.update({
      filter: {
        userId,
        sessionId,
      },
      values,
    });
  }

  async getConversation({
    sessionId,
    userId,
  }: {
    sessionId: string;
    userId?: string | number;
  }) {
    const conversation = await this.aiConversationsRepo.findOne({
      filter: {
        sessionId,
      },
    });

    if (!userId) {
      return conversation;
    }

    if (!conversation) {
      return null;
    }

    const ownershipCheck = await this.aiConversationsRepo.count({
      filter: { sessionId, userId },
    });

    if (ownershipCheck) {
      return conversation;
    } else {
      return null;
    }
  }

  async getMessages({
    userId,
    sessionId,
    cursor,
    paginate = true,
    updateRead = false,
  }: GetAIConversationMessagesParams): Promise<GetAIConversationMessagesResult> {
    const conversation = await this.getConversation({
      sessionId,
      userId,
    });

    if (!conversation) {
      throw new Error('invalid sessionId');
    }

    if (updateRead) {
      await this.aiConversationsRepo.update({
        values: {
          read: true,
        },
        filter: {
          sessionId,
        },
      });
    }

    const pageSize = 10;
    const maxLimit = 200;
    const messageRepository = this.ctx.repositories.aiMessages;
    const filter = {
      sessionId,
      role: {
        $notIn: ['tool'],
      },
    };
    if (paginate && cursor) {
      filter['messageId'] = {
        $lt: cursor,
      };
    }
    const rows = await messageRepository.find({
      sort: ['-messageId'],
      limit: paginate ? pageSize + 1 : maxLimit,
      filter,
    });

    const hasMore = paginate && rows.length > pageSize;
    const data = hasMore ? rows.slice(0, -1) : rows;
    const newCursor = data.length ? data[data.length - 1].messageId : null;

    const subAgentConversations = data
      .filter(
        (row: ParsedMessageRow) =>
          row.metadata?.subAgentConversations?.length ?? 0 > 0,
      )
      .flatMap(
        (row: ParsedMessageRow) =>
          row.metadata.subAgentConversations as SubAgentConversationMetadata[],
      );
    const subAgentConversationSessionIds = [
      ...new Set(subAgentConversations.map((item) => item.sessionId)),
    ];
    const subAgentConversationMessages = subAgentConversationSessionIds.length
      ? await this.aiMessagesRepo.find({
          sort: ['messageId'],
          filter: {
            sessionId: {
              $in: subAgentConversationSessionIds,
            },
            role: {
              $notIn: ['tool'],
            },
          },
        })
      : [];
    const subAgentConversationMessageMap = new Map<string, any[]>();

    const toolCallIds = [
      ...data
        .filter((row: ParsedMessageRow) => row?.toolCalls?.length ?? 0 > 0)
        .flatMap((row: ParsedMessageRow) => row.toolCalls)
        .map((toolCall: AIToolCall) => toolCall.id),
      ...subAgentConversationMessages
        .filter((row: ParsedMessageRow) => row?.toolCalls?.length ?? 0 > 0)
        .flatMap((row: ParsedMessageRow) => row.toolCalls)
        .map((toolCall: AIToolCall) => toolCall.id),
    ];
    const toolMessages = await this.aiToolMessagesRepo.find({
      filter: {
        toolCallId: {
          $in: toolCallIds,
        },
      },
    });
    const toolMessageKey = (messageId: string, toolCallId: string) =>
      `${messageId}:${toolCallId}`;
    const toolMessageMap = new Map<string, AIToolMessage>(
      toolMessages.map((toolMessage: AIToolMessage) => [
        toolMessageKey(toolMessage.messageId, toolMessage.toolCallId),
        toolMessage,
      ]),
    );

    const tools = await this.ctx.ai.toolsManager.listTools({});
    const toolsMap = new Map<string, any>(
      tools.map((tool) => [tool.definition.name, tool]),
    );

    const parseMessageRow = (row: ParsedMessageRow) => {
      if (row?.toolCalls?.length ?? 0 > 0) {
        for (const toolCall of row.toolCalls) {
          const tool = toolsMap.get(toolCall.name);
          const toolMessage = toolMessageMap.get(
            toolMessageKey(row.messageId, toolCall.id),
          );
          toolCall.invokeStatus = toolMessage?.invokeStatus;
          toolCall.invokeStartTime = toolMessage?.invokeStartTime;
          toolCall.invokeEndTime = toolMessage?.invokeEndTime;
          toolCall.auto = toolMessage?.auto;
          toolCall.status = toolMessage?.status;
          toolCall.content = toolMessage?.content;
          toolCall.execution = tool?.execution;
          toolCall.willInterrupt =
            tool?.execution === 'frontend' || toolMessage?.auto === false;
          toolCall.defaultPermission = tool?.defaultPermission;
        }
      }

      const providerOptions = this.ctx.ai.llmProviderManager.llmProviders.get(
        row.metadata?.provider,
      );
      if (!providerOptions) {
        return parseResponseMessage(row);
      }
      const Provider = providerOptions.provider;
      const provider = new Provider({
        context: this.ctx,
      });
      return provider.parseResponseMessage(row);
    };

    for (const row of subAgentConversationMessages as ParsedMessageRow[]) {
      const sessionMessages =
        subAgentConversationMessageMap.get(row.sessionId) ?? [];
      sessionMessages.push(parseMessageRow(row));
      sessionMessages.forEach((it) => (it.content.from = 'sub-agent'));
      subAgentConversationMessageMap.set(row.sessionId, sessionMessages);
    }

    return {
      rows: data.map((row: ParsedMessageRow) => {
        const parsedRow = parseMessageRow(row);
        const subAgentConversationItems =
          (row.metadata
            ?.subAgentConversations as SubAgentConversationMetadata[]) ?? [];
        if (subAgentConversationItems.length) {
          parsedRow.content.subAgentConversations =
            subAgentConversationItems.map((item) => ({
              sessionId: item.sessionId,
              toolCallId: item.toolCallId,
              status: item.status,
              messages:
                subAgentConversationMessageMap.get(item.sessionId) ?? [],
            }));
        }
        parsedRow.content.from = 'main-agent';
        return parsedRow;
      }),
      ...(paginate && {
        hasMore,
        cursor: newCursor,
      }),
    };
  }

  async getUserDecisions(
    messageId: string,
  ): Promise<{ interruptId?: string; decisions: UserDecision[] } | undefined> {
    const allInterruptedToolCall = await this.aiToolMessagesRepo.find({
      filter: {
        messageId,
        interruptActionOrder: { $ne: null },
      },
      sort: ['interruptActionOrder'],
    });
    if (!allInterruptedToolCall.every((t) => t.invokeStatus === 'waiting')) {
      return;
    }

    const message = await this.aiMessagesRepo.findOne({
      filter: {
        messageId,
      },
    });
    const interruptId = message?.metadata?.interruptId;
    return {
      interruptId,
      decisions: allInterruptedToolCall.map(
        (item) => item.userDecision as UserDecision,
      ),
    };
  }

  async resolveSubAgentConversation(
    sessionId: string,
    toolCallId: string,
  ): Promise<SubAgentConversationMetadata> {
    if (!sessionId || !toolCallId) {
      return null;
    }
    const toolMessage = await this.aiToolMessagesRepo.findOne({
      filter: {
        sessionId,
        toolCallId,
      },
    });
    if (!toolMessage) {
      return null;
    }
    const aiMessage = await this.aiMessagesRepo.findOne({
      filter: {
        sessionId,
        messageId: String(toolMessage.messageId),
      },
    });
    if (!aiMessage) {
      return null;
    }
    if (!aiMessage.metadata?.subAgentConversations?.length) {
      return null;
    }
    const subAgentConversation = aiMessage.metadata.subAgentConversations.find(
      (it) => it.toolCallId == toolCallId,
    );
    if (!subAgentConversation) {
      return null;
    }
    return subAgentConversation;
  }

  private get aiConversationsRepo() {
    return this.ctx.repositories.aiConversations;
  }

  private get aiMessagesRepo() {
    return this.ctx.repositories.aiMessages;
  }

  private get aiToolMessagesRepo() {
    return this.ctx.repositories.aiToolMessages;
  }
}
