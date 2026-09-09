import { createAgent } from 'langchain';
import type {
  AIChatConversation,
  AIMessage,
  AIMessageInput,
  AIToolMessage,
  LLMProvider,
} from '@nocobase/ai-employee';
import type { DatabaseConnection } from '@nocobase/db';
import type { IdGeneratorService } from '@nocobase/snowflake';
import type {
  AIConversationRepository,
  AIToolMessageRepository,
  LCCheckpointBlobRepository,
  LCCheckpointRepository,
  LCCheckpointWriteRepository,
} from '../../repository/index.js';
import type {
  AgentThread,
  ConversationMessageStore,
  SavedAssistantMessage,
  ToolCallPolicy,
} from '../types.js';
import { NativeCollectionSaver } from './checkpoints/index.js';

export interface AIEmployeeConversationMessageStoreOptions {
  readonly sessionId: string;
  readonly conversation: AIChatConversation;
  readonly conversations: AIConversationRepository;
  readonly toolMessages: AIToolMessageRepository;
  readonly snowflake: IdGeneratorService;
  readonly toolCallPolicy: ToolCallPolicy;
  readonly checkpoints: LCCheckpointRepository;
  readonly checkpointBlobs: LCCheckpointBlobRepository;
  readonly checkpointWrites: LCCheckpointWriteRepository;
}

export class AIEmployeeConversationMessageStore implements ConversationMessageStore {
  private readonly sessionId: string;
  private readonly conversation: AIChatConversation;
  private readonly conversations: AIConversationRepository;
  private readonly toolMessages: AIToolMessageRepository;
  private readonly snowflake: IdGeneratorService;
  private readonly toolCallPolicy: ToolCallPolicy;
  private readonly checkpoints: LCCheckpointRepository;
  private readonly checkpointBlobs: LCCheckpointBlobRepository;
  private readonly checkpointWrites: LCCheckpointWriteRepository;

  public constructor(options: AIEmployeeConversationMessageStoreOptions) {
    this.sessionId = options.sessionId;
    this.conversation = options.conversation;
    this.conversations = options.conversations;
    this.toolMessages = options.toolMessages;
    this.snowflake = options.snowflake;
    this.toolCallPolicy = options.toolCallPolicy;
    this.checkpoints = options.checkpoints;
    this.checkpointBlobs = options.checkpointBlobs;
    this.checkpointWrites = options.checkpointWrites;
  }

  public loadMessages(messageId?: string): Promise<AIMessage[]> {
    return this.conversation.listMessages({ messageId });
  }
  public saveUserMessages(
    messages: AIMessageInput[],
    messageId?: string,
    thread?: AgentThread,
  ): Promise<void> {
    return this.conversation.withTransaction(async (target, transaction) => {
      if (thread) await this.updateThreadWithConnection(thread, transaction);
      if (messageId && (await target.getMessage(messageId))) {
        await target.removeMessages({ messageId });
      }
      if (messages.length) await target.addMessages(messages);
    });
  }

  public saveAssistantMessage(
    message: AIMessageInput,
  ): Promise<SavedAssistantMessage> {
    return this.conversation.withTransaction(async (target, transaction) => {
      const saved = await target.addMessages(message);
      const toolCalls = saved.toolCalls ?? [];
      if (!toolCalls.length) {
        return { message: saved, initializedToolCalls: [] };
      }

      const now = new Date();
      const toolsMap = await this.toolCallPolicy.getToolsMap();
      const initializedToolCalls = (await this.toolMessages.create(
        {
          values: await Promise.all(
            toolCalls.map(async (toolCall) => {
              const tool = toolsMap.get(toolCall.name);
              const exists = Boolean(tool);
              return {
                id: this.snowflake.generate(),
                sessionId: this.sessionId,
                messageId: saved.messageId,
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                status: exists ? null : 'error',
                content: exists ? null : `Tool ${toolCall.name} not found`,
                invokeStatus: exists ? 'init' : 'done',
                invokeStartTime: exists ? null : now,
                invokeEndTime: exists ? null : now,
                auto: await this.toolCallPolicy.isAutoCall(tool, toolCall.args),
                execution: tool?.execution ?? 'backend',
              };
            }),
          ),
        },
        { connection: transaction },
      )) as AIToolMessage[];

      return { message: saved, initializedToolCalls };
    });
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

    await this.conversation.withTransaction(async (target, transaction) => {
      await target.addMessages(messages);
      await this.toolMessages.update(
        {
          values: { invokeStatus: 'confirmed' },
          filter: {
            sessionId: this.sessionId,
            messageId: sourceMessageId,
            toolCallId: { $in: toolCallIds },
          },
        },
        { connection: transaction },
      );
    });
  }

  public async currentThread(): Promise<AgentThread> {
    const target = await this.conversations.findOne({
      filter: { sessionId: this.sessionId },
    });
    if (!target) throw new Error('Conversation not existed');
    const thread = target.thread ?? 0;
    return {
      sessionId: this.sessionId,
      thread,
      threadId: `${this.sessionId}:${thread}`,
    };
  }

  public async forkThread(
    llmProvider: LLMProvider,
  ): Promise<AgentThread | undefined> {
    const current = await this.currentThread();
    for (let attempt = 0; attempt < 4; attempt++) {
      const thread = current.thread + attempt + 1;
      const candidate = {
        sessionId: this.sessionId,
        thread,
        threadId: `${this.sessionId}:${thread}`,
      };
      const saver = new NativeCollectionSaver({
        checkpoints: this.checkpoints,
        blobs: this.checkpointBlobs,
        writes: this.checkpointWrites,
      });
      const agent = createAgent({
        model: llmProvider.createModel() as any,
        tools: [],
        checkpointer: saver as any,
      });
      const snapshot = await agent.graph.getState({
        configurable: { thread_id: candidate.threadId },
      });
      if (!snapshot.config.configurable?.checkpoint_id) return candidate;
    }
    throw new Error('Fail to create new agent thread');
  }

  public updateThread(thread: AgentThread): Promise<void> {
    return this.updateThreadWithConnection(thread);
  }

  private updateThreadWithConnection(
    thread: AgentThread,
    connection?: DatabaseConnection,
  ): Promise<void> {
    return this.conversations
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
