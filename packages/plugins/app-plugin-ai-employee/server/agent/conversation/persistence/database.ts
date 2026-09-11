import type { ConversationPersistence } from '../../contracts/persistence.js';
import { createAIChatConversation } from './ai-chat-conversation.js';
import type {
  AIConversationRepository,
  AIMessageRepository,
  AIToolMessageRepository,
  AIUsageEventRepository,
} from '../../../repository/index.js';
import type { DatabaseConnection } from '@nocobase/db';
import type { IdGeneratorService } from '@nocobase/snowflake';

export class DatabaseConversationPersistence implements ConversationPersistence {
  private readonly database: DatabaseConnection;
  private readonly snowflake: IdGeneratorService;
  public readonly usageEvents: AIUsageEventRepository;
  public readonly conversations: AIConversationRepository;
  public readonly messages: AIMessageRepository;
  public readonly toolMessages: AIToolMessageRepository;
  public constructor(options: {
    database: DatabaseConnection;
    snowflake: IdGeneratorService;
    conversations: AIConversationRepository;
    messages: AIMessageRepository;
    toolMessages: AIToolMessageRepository;
    usageEvents: AIUsageEventRepository;
  }) {
    this.database = options.database;
    this.snowflake = options.snowflake;
    this.conversations = options.conversations;
    this.messages = options.messages;
    this.toolMessages = options.toolMessages;
    this.usageEvents = options.usageEvents;
  }
  public createChatConversation(options: { sessionId: string }) {
    return createAIChatConversation({
      messages: this.messages,
      conversations: this.conversations,
      usageEvents: this.usageEvents,
      database: this.database,
      snowflake: this.snowflake,
      sessionId: options.sessionId,
    });
  }
}
