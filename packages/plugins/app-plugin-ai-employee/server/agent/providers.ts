import type { AIConversationRepository } from '../repository/ai-conversation.js';
import type { AIEmployeesManager } from '../manager/ai-employees-manager.js';
import { LLMStreamCached } from '../manager/llm-stream-cached-manager.js';
import type { Logger } from '@nocobase/logging';
import { DefaultChatMessageConverters } from './message/converters.js';
import { createAIChatConversation } from './conversation/persistence/ai-chat-conversation.js';
import { DefaultConversationMessageStore } from './conversation/message-store.js';
import { listCurrentFrontendTools } from './context/ai-employee/frontend-tools.js';
import type { AIEmployeeContextOptions } from './context/ai-employee/options.js';
import {
  DEFAULT_AGENT_FEATURES,
  type AgentAbortController,
  type AgentAbortHandle,
  type AgentEventHandler,
  type AgentFeatureOptions,
  type AgentProviders,
  type ConversationMessageStore,
  type ConversationProvider,
  type CreateAgentProvidersOptions,
} from './types.js';

class NoopLogger {
  public readonly level = 'silent';

  public fatal(): void {}
  public error(): void {}
  public warn(): void {}
  public info(): void {}
  public debug(): void {}
  public trace(): void {}
  public silent(): void {}
  public child(): NoopLogger {
    return this;
  }
  public bindings(): Record<string, never> {
    return {};
  }
  public flush(): void {}
  public isLevelEnabled(): boolean {
    return false;
  }
}

const noopLogger = new NoopLogger() as unknown as Logger;

export class DefaultAgentEventHandler implements AgentEventHandler {
  public constructor(
    private readonly conversations: AIConversationRepository,
    private readonly sessionId: string,
  ) {}

  public async beforeExecution(mode: 'streaming' | 'invoking'): Promise<void> {
    await this.conversations.update({
      values: { llmActiveState: mode },
      filter: { sessionId: this.sessionId },
    });
  }

  public async afterExecution(
    mode: 'streaming' | 'invoking',
    result?: { aborted?: boolean },
  ): Promise<void> {
    await this.conversations.update({
      values: {
        llmActiveState: 'idle',
        ...(mode === 'streaming'
          ? { read: result?.aborted ? true : false }
          : {}),
      },
      filter: { sessionId: this.sessionId },
    });
  }
}

export class DefaultAgentAbortController implements AgentAbortController {
  public constructor(
    private readonly manager: AIEmployeesManager,
    private readonly sessionId: string,
  ) {}

  public registerAbortHandle(token: symbol, handle: AgentAbortHandle): void {
    this.manager.registerAgentAbortHandle(this.sessionId, token, handle);
  }

  public unregisterAbortHandle(token: symbol): void {
    this.manager.unregisterAgentAbortHandle(this.sessionId, token);
  }
}

export class DefaultConversationProvider implements ConversationProvider {
  public constructor(
    public readonly messages: ConversationMessageStore,
    public readonly streamCache: LLMStreamCached,
    public readonly event: AgentEventHandler,
    public readonly abort: AgentAbortController,
  ) {}
}

export function createConversationProvider(
  options: AIEmployeeContextOptions,
): ConversationProvider {
  const database = options.database;
  const sessionId = options.sessionId;
  const chatConversation = createAIChatConversation({
    messages: options.aiMessages,
    conversations: options.aiConversations,
    usageEvents: options.aiUsageEvents,
    database,
    snowflake: options.snowflake,
    sessionId,
  });
  const cache = options.llmStreamCachedManager.getCached(sessionId);
  const messageStore = new DefaultConversationMessageStore({
    sessionId,
    conversation: chatConversation,
    database,
    messages: options.aiMessages,
    toolMessages: options.aiToolMessages,
    snowflake: options.snowflake,
    getCurrentFrontendTools: () =>
      listCurrentFrontendTools(options.aiConversations, {
        ...(options.execution ?? {}),
        sessionId,
      }),
  });
  return new DefaultConversationProvider(
    messageStore,
    cache,
    new DefaultAgentEventHandler(options.aiConversations, sessionId),
    new DefaultAgentAbortController(options.aiEmployeesManager, sessionId),
  );
}

class DefaultAgentProviders implements AgentProviders {
  public readonly conversation: ConversationProvider;
  public readonly context: AgentProviders['context'];
  public readonly chatContext: AgentProviders['context'];
  public readonly converters: AgentProviders['converters'];
  public readonly logger: Logger;
  public readonly features: AgentFeatureOptions;
  public readonly checkpointer: AgentProviders['checkpointer'];

  public constructor(options: CreateAgentProvidersOptions) {
    this.conversation = options.conversation;
    this.context = options.context ?? options.chatContext;
    this.chatContext = this.context;
    this.logger = options.logger ?? noopLogger;
    this.converters = options.converters ?? new DefaultChatMessageConverters();
    this.features = {
      ...DEFAULT_AGENT_FEATURES,
      ...(options.features ?? {}),
    };
    this.checkpointer = options.checkpointer;
  }
}

export function createAgentProviders(
  options: CreateAgentProvidersOptions,
): AgentProviders {
  return new DefaultAgentProviders(options);
}
