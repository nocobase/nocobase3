import type { DatabaseConnection } from '@nocobase/db';
import type { IdGeneratorService } from '@nocobase/snowflake';
import type { AIChatConversation } from '@nocobase/ai-employee';
import type {
  AIMessageRepository,
  AIToolMessageRepository,
  AIConversationRepository,
} from '../../repository/index.js';
import type { AIUsageEventRepository } from '../../repository/ai-usage-event.js';

export interface ConversationPersistence {
  readonly conversations: AIConversationRepository;
  readonly messages: AIMessageRepository;
  readonly toolMessages: AIToolMessageRepository;
  readonly usageEvents: AIUsageEventRepository;
  readonly database: DatabaseConnection;
  readonly snowflake: IdGeneratorService;
  createChatConversation(options: { sessionId: string }): AIChatConversation;
}
