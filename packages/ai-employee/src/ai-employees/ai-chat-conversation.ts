/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import _ from 'lodash';
import {
  AIChatContext,
  AIChatContextOptions,
  AIChatConversation,
  AIMessage,
  AIMessageInput,
  AIMessageQuery,
  AIMessageRemoveOptions,
} from './types/index.js';
import type { Context } from '../app/context.js';
import type { DatabaseConnection } from '@nocobase/app-database';
import type { CollectionFilter } from '../repository/collection.js';
import { recordAIUsageEventsForMessages } from './ai-usage-events.js';
export const createAIChatConversation = (
  ctx: Context,
  sessionId: string,
): AIChatConversation => {
  return new AIChatConversationImpl(ctx, sessionId);
};

class AIChatConversationImpl implements AIChatConversation {
  private transaction?: DatabaseConnection;
  constructor(
    private ctx: Context,
    private sessionId: string,
  ) {}
  async withTransaction<T>(
    runnable: (
      instance: AIChatConversationImpl,
      transaction: DatabaseConnection,
    ) => Promise<T>,
    transaction?: DatabaseConnection,
  ): Promise<T> {
    const instance = this.clone();
    if (transaction) {
      instance.transaction = transaction as DatabaseConnection;
      return await runnable(instance, transaction);
    }
    return await instance.ctx.database.transaction(async (connection) => {
      instance.transaction = connection;
      return await runnable(instance, connection);
    });
  }

  getSessionId(): string {
    return this.sessionId;
  }

  async addMessages(messages: AIMessageInput): Promise<AIMessage>;
  async addMessages(messages: AIMessageInput[]): Promise<AIMessage[]>;
  async addMessages(
    messages: AIMessageInput | AIMessageInput[],
  ): Promise<AIMessage | AIMessage[]> {
    const isArray = _.isArray(messages);
    const messageList = isArray ? messages : [messages];
    const instances: AIMessage[] = await this.aiMessagesRepo.create(
      {
        values: messageList.map(
          (message) =>
            ({
              messageId: String(this.snowflake()),
              sessionId: this.sessionId,
              role: message.role,
              content: message.content,
              attachments: message.attachments,
              workContext: message.workContext,
              metadata: message.metadata,
              toolCalls: message.toolCalls,
            }) as AIMessage,
        ),
      },
      { connection: this.transaction },
    );
    await recordAIUsageEventsForMessages(
      this.ctx,
      this.sessionId,
      instances,
      this.transaction,
    );
    return isArray ? instances : instances[0];
  }
  async removeMessages({ messageId }: AIMessageRemoveOptions): Promise<void> {
    const filter: CollectionFilter<AIMessage> = {
      sessionId: this.sessionId,
    };
    if (messageId) {
      filter.messageId = {
        $gte: messageId,
      };
    }
    await this.aiMessagesRepo.destroy(
      { filter },
      { connection: this.transaction },
    );
  }
  async getMessage(messageId: string): Promise<AIMessage | null> {
    return await this.aiMessagesRepo.findOne({
      filter: { sessionId: this.sessionId, messageId },
    });
  }

  async listMessages(query: AIMessageQuery): Promise<AIMessage[]> {
    const filter: CollectionFilter<AIMessage> = {
      sessionId: this.sessionId,
    };
    if (query?.messageId) {
      filter.messageId = {
        $lt: query.messageId,
      };
    }
    const messages = await this.aiMessagesRepo.find({
      sort: ['-messageId'], // 改为倒序，取最新的
      limit: 50, // 限制最多 50 条消息
      filter,
    });
    return messages.reverse(); // 反转回正序
  }

  async lastUserMessage(): Promise<AIMessage> {
    const filter: CollectionFilter<AIMessage> = {
      sessionId: this.sessionId,
      role: 'user',
    };
    return await this.aiMessagesRepo.findOne({
      sort: ['-messageId'],
      filter,
    });
  }

  async getChatContext(options?: AIChatContextOptions): Promise<AIChatContext> {
    const {
      userMessages,
      userDecisions: decisions,
      tools,
      middleware,
      getSystemPrompt,
      formatMessages,
    } = options ?? {};
    let messages = userMessages
      ? ((await formatMessages?.(userMessages)) ?? [])
      : undefined;
    const additionSystemPrompt = messages
      ?.filter((it) => it.role === 'system')
      .map((it) => it.content)
      .filter(Boolean)
      .join('\n');
    messages = messages?.filter((it) => it.role !== 'system');
    const baseSystemPrompt = await getSystemPrompt?.(userMessages ?? []);
    const systemPrompt =
      [baseSystemPrompt, additionSystemPrompt].filter(Boolean).join('\n\n') ||
      undefined;
    const chatContext: AIChatContext = {
      systemPrompt,
      messages,
      decisions,
      tools,
      middleware,
    };
    return chatContext;
  }

  private clone(): AIChatConversationImpl {
    return new AIChatConversationImpl(this.ctx, this.sessionId);
  }

  private snowflake() {
    return this.ctx.snowflake.generate();
  }

  private get aiMessagesRepo() {
    return this.ctx.repositories.aiMessages;
  }
}
