import type {
  AIChatConversation,
  AIMessage,
  AIMessageInput,
  AIToolMessage,
} from '@nocobase/ai-employee';
import type { DatabaseConnection } from '@nocobase/db';
import type { IdGeneratorService } from '@nocobase/snowflake';

import type {
  AIConversationRepository,
  AIToolMessageRepository,
} from '../../repository/index.js';
import type {
  AgentRequest,
  AgentThread,
  ConversationMessageStore,
  SavedAssistantMessage,
} from '../types.js';
import type { ToolCallPolicy } from './tool-call-policy.js';

export interface AIEmployeeConversationMessageStoreOptions {
  readonly sessionId: string;
  readonly conversation: AIChatConversation;
  readonly conversations: AIConversationRepository;
  readonly toolMessages: AIToolMessageRepository;
  readonly snowflake: IdGeneratorService;
  readonly toolCallPolicy: ToolCallPolicy;
  readonly legacy?: boolean;
}

export class AIEmployeeConversationMessageStore implements ConversationMessageStore {
  public constructor(
    private readonly options: AIEmployeeConversationMessageStoreOptions,
  ) {}

  public load(messageId?: string): Promise<AIMessage[]> {
    return this.options.conversation.listMessages({ messageId });
  }

  public get(messageId: string): Promise<AIMessage | null> {
    return this.options.conversation.getMessage(messageId);
  }

  public add(messages: AIMessageInput): Promise<AIMessage>;
  public add(messages: AIMessageInput[]): Promise<AIMessage[]>;
  public add(
    messages: AIMessageInput | AIMessageInput[],
  ): Promise<AIMessage | AIMessage[]> {
    return this.options.conversation.addMessages(
      messages as AIMessageInput[],
    ) as Promise<AIMessage | AIMessage[]>;
  }

  public remove(messageId?: string): Promise<void> {
    return this.options.conversation.removeMessages({ messageId });
  }

  public saveUserMessages(
    messageId: string | undefined,
    messages: AIMessageInput[],
    thread?: AgentThread,
  ): Promise<void> {
    return this.options.conversation.withTransaction(
      async (target, transaction) => {
        if (thread) await this.updateThread(thread, transaction);
        if (messageId && (await target.getMessage(messageId))) {
          await target.removeMessages({ messageId });
        }
        if (messages.length) await target.addMessages(messages);
      },
    );
  }

  public saveAssistantMessage(
    message: AIMessageInput,
  ): Promise<SavedAssistantMessage> {
    return this.options.conversation.withTransaction(
      async (target, transaction) => {
        const saved = await target.addMessages(message);
        const toolCalls = saved.toolCalls ?? [];
        if (!toolCalls.length) {
          return { message: saved, initializedToolCalls: [] };
        }

        const now = new Date();
        const toolsMap = await this.options.toolCallPolicy.getToolsMap();
        const initializedToolCalls = (await this.options.toolMessages.create(
          {
            values: await Promise.all(
              toolCalls.map(async (toolCall) => {
                const tool = toolsMap.get(toolCall.name);
                const exists = Boolean(tool);
                return {
                  id: this.options.snowflake.generate(),
                  sessionId: this.options.sessionId,
                  messageId: saved.messageId,
                  toolCallId: toolCall.id,
                  toolName: toolCall.name,
                  status: exists ? null : 'error',
                  content: exists ? null : `Tool ${toolCall.name} not found`,
                  invokeStatus: exists ? 'init' : 'done',
                  invokeStartTime: exists ? null : now,
                  invokeEndTime: exists ? null : now,
                  auto: await this.options.toolCallPolicy.isAutoCall(
                    tool,
                    toolCall.args,
                  ),
                  execution: tool?.execution ?? 'backend',
                };
              }),
            ),
          },
          { connection: transaction },
        )) as AIToolMessage[];

        return { message: saved, initializedToolCalls };
      },
    );
  }

  public async saveToolMessages(
    sourceMessageId: string,
    messages: AIMessageInput[],
  ): Promise<void> {
    if (!messages.length) return;

    const toolCallIds = messages.map((message) => {
      const toolCallId = message.metadata?.toolCallId;
      if (typeof toolCallId !== 'string' || !toolCallId) {
        throw new Error('Tool message requires metadata.toolCallId');
      }
      return toolCallId;
    });

    await this.options.conversation.withTransaction(
      async (target, transaction) => {
        await target.addMessages(messages);
        await this.options.toolMessages.update(
          {
            values: { invokeStatus: 'confirmed' },
            filter: {
              sessionId: this.options.sessionId,
              messageId: sourceMessageId,
              toolCallId: { $in: toolCallIds },
            },
          },
          { connection: transaction },
        );
      },
    );
  }

  public saveInterruptedAssistantMessage(
    message: AIMessageInput,
  ): Promise<AIMessage> {
    return this.options.conversation.withTransaction((target) =>
      target.addMessages(message),
    );
  }

  public shouldLoadHistory(request: AgentRequest): boolean {
    return Boolean(request.messageId) || this.options.legacy === true;
  }

  public updateThread(
    thread: AgentThread,
    connection?: DatabaseConnection,
  ): Promise<void> {
    return this.options.conversations
      .update(
        {
          values: { thread: thread.thread },
          filter: {
            sessionId: thread.sessionId,
            thread: { $lt: thread.thread },
          },
        },
        connection ? { connection } : undefined,
      )
      .then(() => undefined);
  }
}
