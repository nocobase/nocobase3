import type { AIChatConversation } from '@nocobase/ai-employee';
import type { ConversationPersistence } from '../server/agent/contracts/persistence.js';
import type {
  AIConversationRepository,
  AIMessageRepository,
  AIToolMessageRepository,
  AIUsageEventRepository,
} from '../server/repository/index.js';

/** Test-only persistence seam; production always uses DatabaseConversationPersistence. */
export class MemoryConversationPersistence implements ConversationPersistence {
  public readonly conversations = {} as AIConversationRepository;
  public readonly messages = {} as AIMessageRepository;
  public readonly toolMessages = {} as AIToolMessageRepository;
  public readonly usageEvents = {} as AIUsageEventRepository;
  public createChatConversation(_options: {
    sessionId: string;
  }): AIChatConversation {
    throw new Error(
      'Memory conversation fixture must provide a conversation factory',
    );
  }
}
