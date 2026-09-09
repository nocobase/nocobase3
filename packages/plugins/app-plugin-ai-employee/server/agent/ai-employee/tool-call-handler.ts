import type { AIMessageInput, AIToolMessage } from '@nocobase/ai-employee';
import type { DatabaseConnection } from '@nocobase/db';
import type { IdGeneratorService } from '@nocobase/snowflake';

import type {
  AIMessageRepository,
  AIToolMessageEntity,
  AIToolMessageRepository,
} from '../../repository/index.js';
import type {
  AgentInterruptAction,
  ConversationToolCallStore,
} from '../types.js';

export interface AIEmployeeToolCallHandlerOptions {
  sessionId: string;
  database: DatabaseConnection;
  messages: AIMessageRepository;
  toolMessages: AIToolMessageRepository;
  snowflake: IdGeneratorService;
}

type NormalizedToolCallResult = {
  status: string;
  content: unknown;
};

type SourceMessageMetadata = {
  model?: unknown;
  provider?: unknown;
  llmService?: unknown;
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

function sourceMessageMetadata(metadata: unknown): SourceMessageMetadata {
  if (typeof metadata !== 'object' || metadata === null) return {};
  const value = metadata as Record<string, unknown>;
  return {
    model: value.model,
    provider: value.provider,
    llmService: value.llmService,
  };
}

export class AIEmployeeToolCallHandler implements ConversationToolCallStore {
  public constructor(
    private readonly options: AIEmployeeToolCallHandlerOptions,
  ) {}

  public markInterrupted(
    sessionId: string,
    messageId: string,
    toolCallId: string,
    interruptId: string,
    interruptAction: AgentInterruptAction,
  ): Promise<number> {
    return this.options.database.transaction(async (transaction) => {
      const updated = await this.options.toolMessages.update(
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

      const message = await this.options.messages.findOne(
        { filter: { messageId, sessionId } },
        { connection: transaction },
      );
      if (!message) return updated;

      await this.options.messages.update(
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
    return this.options.toolMessages.update({
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
    return this.options.toolMessages.update({
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

  public async reject(
    _messageId: string,
    toolCallIds: string[],
    reason?: string,
  ): Promise<number> {
    await this.cancelWithReason(reason);
    return toolCallIds.length;
  }

  public cancel(): Promise<AIMessageInput[] | undefined> {
    return this.cancelWithReason();
  }

  public async get(
    messageId: string,
    toolCallId: string,
  ): Promise<AIToolMessage | null> {
    return this.options.toolMessages.findOne({
      filter: { sessionId: this.options.sessionId, messageId, toolCallId },
    });
  }

  public async getMany(
    messageId: string,
    toolCallIds: string[],
  ): Promise<Map<string, AIToolMessage>> {
    const list: AIToolMessageEntity[] = await this.options.toolMessages.find({
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

  private async cancelWithReason(
    reason: string = 'The user ignored the application for tools usage and will continued to ask questions',
  ): Promise<AIMessageInput[] | undefined> {
    const historyMessages = await this.options.messages.find({
      filter: { sessionId: this.options.sessionId },
      sort: ['-messageId'],
    });
    const [sourceMessage] = historyMessages;
    if (!sourceMessage?.toolCalls?.length) return undefined;

    const messageId = sourceMessage.messageId;
    const toolMessages = await this.options.toolMessages.find({
      filter: {
        sessionId: this.options.sessionId,
        messageId,
        invokeStatus: { $ne: 'confirmed' },
      },
    });
    if (!toolMessages.length) return undefined;

    const toolCallMap = new Map(
      sourceMessage.toolCalls.map((toolCall) => [toolCall.id, toolCall]),
    );
    const metadata = sourceMessageMetadata(sourceMessage.metadata);
    const now = new Date();
    return this.options.database.transaction(async (transaction) => {
      for (const toolMessage of toolMessages) {
        await this.options.toolMessages.update(
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
              sessionId: this.options.sessionId,
              invokeStatus: toolMessage.invokeStatus,
            },
          },
          { connection: transaction },
        );
      }
      return this.options.messages.create(
        {
          values: toolMessages.map((toolMessage) => ({
            messageId: String(this.options.snowflake.generate()),
            sessionId: this.options.sessionId,
            role: 'tool',
            content: { type: 'text', content: reason },
            metadata: {
              model: metadata.model,
              provider: metadata.provider,
              llmService: metadata.llmService,
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
}
