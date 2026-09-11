import type { Logger } from '@nocobase/logging';
import type { DatabaseConnection } from '@nocobase/db';
import type { IdGeneratorService } from '@nocobase/snowflake';
import type { AIEmployeesManager } from '../../manager/ai-employees-manager.js';
import type { LLMStreamCachedManager } from '../../manager/llm-stream-cached-manager.js';
import type {
  AgentAbortController,
  AgentEventHandler,
  ConversationProvider,
} from '../types.js';
import { ConversationMessageStoreImpl } from './message-store.js';
import { ConversationAbortController } from './abort-controller.js';
import { ConversationEventHandler } from './event-handler.js';
import type { ConversationPersistence } from '../contracts/persistence.js';
import type { FrontendToolManifest } from '../context/ai-employee/common/frontend-tool-contracts.js';

export interface ConversationProviderOptions {
  readonly sessionId: string;
  readonly persistence: ConversationPersistence;
  readonly streamCache: LLMStreamCachedManager;
  readonly employeesManager: AIEmployeesManager;
  readonly database: DatabaseConnection;
  readonly snowflake: IdGeneratorService;
  readonly logger?: Logger;
  readonly getCurrentFrontendTools?: () => Promise<
    readonly FrontendToolManifest[]
  >;
}

export class DefaultConversationProvider implements ConversationProvider {
  public readonly messages;
  public readonly streamCache;
  public readonly event: AgentEventHandler;
  public readonly abort: AgentAbortController;

  public constructor(options: ConversationProviderOptions) {
    const conversation = options.persistence.createChatConversation({
      sessionId: options.sessionId,
    });
    this.streamCache = options.streamCache.getCached(options.sessionId);
    this.messages = new ConversationMessageStoreImpl({
      sessionId: options.sessionId,
      conversation,
      database: options.database,
      messages: options.persistence.messages,
      toolMessages: options.persistence.toolMessages,
      getCurrentFrontendTools:
        options.getCurrentFrontendTools ?? (async () => []),
    });
    this.event = new ConversationEventHandler(
      options.persistence.conversations,
      options.sessionId,
      options.logger,
    );
    this.abort = new ConversationAbortController(
      options.employeesManager,
      options.sessionId,
    );
  }
}
