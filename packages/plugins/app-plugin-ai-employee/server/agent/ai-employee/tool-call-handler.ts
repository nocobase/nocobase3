import type { AIToolCall, AIToolMessage } from '@nocobase/ai-employee';
import type { DatabaseConnection } from '@nocobase/db';
import type { IdGeneratorService } from '@nocobase/snowflake';

import type { RepositoryFactory } from '../../factory/repository-factory.js';
import type { AIToolMessageEntity } from '../../repository/index.js';
import type {
  AgentInterruptAction,
  ConversationToolCallStore,
} from '../types.js';
import type { ToolCallPolicy } from './tool-call-policy.js';

export interface AIEmployeeToolCallHandlerOptions {
  sessionId: string;
  database: DatabaseConnection;
  repositories: RepositoryFactory;
  snowflake: IdGeneratorService;
  policy: ToolCallPolicy;
  cancellation: Pick<ConversationToolCallStore, 'cancel' | 'reject'>;
}

type NormalizedToolCallResult = {
  status: string;
  content: unknown;
};

function normalizeToolCallResult(result: unknown): NormalizedToolCallResult {
  if (typeof result !== 'object' || result === null) {
    return { status: 'success', content: result };
  }
  const value = result as Record<string, unknown>;
  return {
    status: typeof value.status === 'string' ? value.status : 'success',
    content: value.content ?? result,
  };
}

export class AIEmployeeToolCallHandler implements ConversationToolCallStore {
  public constructor(
    private readonly options: AIEmployeeToolCallHandlerOptions,
  ) {}

  public initialize(
    messageId: string,
    toolCalls: AIToolCall[],
  ): Promise<AIToolMessage[]> {
    return this.options.database.transaction((transaction) =>
      this.initializeInTransaction(transaction, messageId, toolCalls),
    );
  }

  public async initializeInTransaction(
    transaction: DatabaseConnection,
    messageId: string,
    toolCalls: AIToolCall[],
  ): Promise<AIToolMessage[]> {
    const now = new Date();
    const toolsMap = await this.options.policy.getToolsMap();
    return this.options.repositories.aiToolMessages.create(
      {
        values: await Promise.all(
          toolCalls.map(async (toolCall) => {
            const tool = toolsMap.get(toolCall.name);
            const exists = Boolean(tool);
            return {
              id: this.options.snowflake.generate(),
              sessionId: this.options.sessionId,
              messageId,
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              status: exists ? null : 'error',
              content: exists ? null : `Tool ${toolCall.name} not found`,
              invokeStatus: exists ? 'init' : 'done',
              invokeStartTime: exists ? null : now,
              invokeEndTime: exists ? null : now,
              auto: await this.options.policy.isAutoCall(tool, toolCall.args),
              execution: tool?.execution ?? 'backend',
            };
          }),
        ),
      },
      { connection: transaction },
    );
  }

  public markInterrupted(
    sessionId: string,
    messageId: string,
    toolCallId: string,
    interruptId: string,
    interruptAction: AgentInterruptAction,
  ): Promise<number> {
    return this.options.database.transaction(async (transaction) => {
      const updated = await this.options.repositories.aiToolMessages.update(
        {
          values: {
            invokeStatus: 'interrupted',
            interruptActionOrder: interruptAction.order,
            interruptAction,
          },
          filter: { sessionId, messageId, toolCallId, invokeStatus: 'init' },
        },
        { connection: transaction },
      );
      if (!updated) return updated;

      const message = await this.options.repositories.aiMessages.findOne(
        { filter: { messageId, sessionId } },
        { connection: transaction },
      );
      if (!message) return updated;

      await this.options.repositories.aiMessages.update(
        {
          values: { metadata: { ...(message.metadata ?? {}), interruptId } },
          filter: { messageId, sessionId },
        },
        { connection: transaction },
      );
      return updated;
    });
  }

  public markPending(messageId: string, toolCallId: string): Promise<number> {
    return this.options.repositories.aiToolMessages.update({
      values: { invokeStatus: 'pending', invokeStartTime: new Date() },
      filter: {
        sessionId: this.options.sessionId,
        messageId,
        toolCallId,
        invokeStatus: { $in: ['init', 'waiting'] },
      },
    });
  }

  public markDone(
    messageId: string,
    toolCallId: string,
    result: unknown,
  ): Promise<number> {
    const normalized = normalizeToolCallResult(result);
    return this.options.repositories.aiToolMessages.update({
      values: {
        invokeStatus: 'done',
        invokeEndTime: new Date(),
        status: normalized.status,
        content: normalized.content,
      },
      filter: {
        sessionId: this.options.sessionId,
        messageId,
        toolCallId,
        invokeStatus: 'pending',
      },
    });
  }

  public markError(
    messageId: string,
    toolCallId: string,
    error: unknown,
  ): Promise<number> {
    return this.markDone(messageId, toolCallId, {
      status: 'error',
      content: error instanceof Error ? error.message : error,
    });
  }

  public confirm(messageId: string, toolCallIds: string[]): Promise<number> {
    return this.options.database.transaction((transaction) =>
      this.confirmInTransaction(transaction, messageId, toolCallIds),
    );
  }

  public confirmInTransaction(
    transaction: DatabaseConnection,
    messageId: string,
    toolCallIds: string[],
  ): Promise<number> {
    return this.options.repositories.aiToolMessages.update(
      {
        values: { invokeStatus: 'confirmed' },
        filter: {
          sessionId: this.options.sessionId,
          messageId,
          toolCallId: { $in: toolCallIds },
        },
      },
      { connection: transaction },
    );
  }

  public reject(
    messageId: string,
    toolCallIds: string[],
    reason?: string,
  ): Promise<number> {
    return this.options.cancellation.reject(messageId, toolCallIds, reason);
  }

  public cancel(): ReturnType<ConversationToolCallStore['cancel']> {
    return this.options.cancellation.cancel();
  }

  public async get(
    messageId: string,
    toolCallId: string,
  ): Promise<AIToolMessage | null> {
    return this.options.repositories.aiToolMessages.findOne({
      filter: { sessionId: this.options.sessionId, messageId, toolCallId },
    });
  }

  public async getMany(
    messageId: string,
    toolCallIds: string[],
  ): Promise<Map<string, AIToolMessage>> {
    const list: AIToolMessageEntity[] =
      await this.options.repositories.aiToolMessages.find({
        filter: {
          sessionId: this.options.sessionId,
          messageId,
          toolCallId: { $in: toolCallIds },
        },
      });
    const result = new Map<string, AIToolMessage>();
    for (const item of list) {
      if (item.toolCallId) result.set(item.toolCallId, item);
    }
    return result;
  }
}
