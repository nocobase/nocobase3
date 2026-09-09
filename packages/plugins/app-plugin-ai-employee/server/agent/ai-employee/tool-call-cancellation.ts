import type { AIMessageInput } from '@nocobase/ai-employee';
import type { DatabaseConnection } from '@nocobase/db';
import type { IdGeneratorService } from '@nocobase/snowflake';

import type { RepositoryFactory } from '../../factory/repository-factory.js';
import type { AIToolMessageEntity } from '../../repository/index.js';
import type { ModelRef } from '../../types.js';
import type { AppAgentContext } from '../context.js';
import type { ConversationToolCallStore } from '../types.js';

type StoredToolCall = {
  id: string;
  args: unknown;
  name: string;
  type: string;
};

export interface AIEmployeeToolCallCancellationOptions {
  agentContext: AppAgentContext;
  database: DatabaseConnection;
  model?: ModelRef;
  repositories: RepositoryFactory;
  snowflake: IdGeneratorService;
}

export class AIEmployeeToolCallCancellation implements Pick<
  ConversationToolCallStore,
  'cancel' | 'reject'
> {
  public constructor(
    private readonly options: AIEmployeeToolCallCancellationOptions,
  ) {}

  public async reject(
    _messageId: string,
    toolCallIds: string[],
    reason?: string,
  ): Promise<number> {
    await this.cancelWithReason(reason);
    return toolCallIds.length;
  }

  public cancel(reason?: string): Promise<AIMessageInput[] | undefined> {
    return this.cancelWithReason(reason);
  }

  private getRequiredModel(): ModelRef {
    if (!this.options.model) throw new Error('AI employee model is required');
    return this.options.model;
  }

  private async cancelWithReason(
    reason: string = 'The user ignored the application for tools usage and will continued to ask questions',
  ): Promise<AIMessageInput[] | undefined> {
    const historyMessages = await this.options.repositories.aiMessages.find({
      sort: ['-messageId'],
    });
    const [lastMessage] = historyMessages;
    if (!lastMessage?.toolCalls?.length) return undefined;
    const messageId = lastMessage.messageId;
    const toolMessages: AIToolMessageEntity[] =
      await this.options.repositories.aiToolMessages.find({
        filter: { messageId, invokeStatus: { $ne: 'confirmed' } },
      });
    if (!toolMessages.length) return undefined;

    const { model, service } =
      await this.options.agentContext.ai.llmProviderManager.getLLMService(
        this.getRequiredModel(),
      );
    const toolCallMap = await this.getToolCallMap(String(messageId));
    const now = new Date();
    return this.options.database.transaction(async (transaction) => {
      for (const toolMessage of toolMessages) {
        await this.options.repositories.aiToolMessages.update(
          {
            values: {
              invokeStatus: 'confirmed',
              status: 'success',
              content: reason,
              invokeStartTime: toolMessage.invokeStartTime ?? now,
              invokeEndTime: toolMessage.invokeEndTime ?? now,
            },
            filter: {
              id: toolMessage.id,
              invokeStatus: toolMessage.invokeStatus,
            },
          },
          { connection: transaction },
        );
      }
      return this.options.repositories.aiMessages.create(
        {
          values: toolMessages.map((toolMessage) => ({
            messageId: String(this.options.snowflake.generate()),
            role: 'tool',
            content: { type: 'text', content: reason },
            metadata: {
              model,
              provider: service.provider,
              toolCall: toolMessage.toolCallId
                ? toolCallMap.get(toolMessage.toolCallId)
                : undefined,
              toolCallId: toolMessage.toolCallId,
              sourceMessageId: messageId,
              autoCall: toolMessage.auto,
            },
          })),
        },
        { connection: transaction },
      );
    });
  }

  private async getToolCallMap(
    messageId: string,
  ): Promise<Map<string, StoredToolCall>> {
    const result = new Map<string, StoredToolCall>();
    const message = await this.options.repositories.aiMessages.findOne({
      filter: { messageId },
    });
    for (const toolCall of message?.toolCalls ?? []) {
      result.set(toolCall.id, toolCall as StoredToolCall);
    }
    return result;
  }
}
