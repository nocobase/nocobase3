import type {
  AIMessage as StoredMessage,
  AIMessageInput,
  AIToolMessage,
} from '@nocobase/ai-employee';
import type { Logger } from '@nocobase/logging';
import {
  LLMStreamCached,
  type LLMStreamCachedManager,
} from '../manager/llm-stream-cached-manager.js';
import { BaseChatMessageConverters } from './chat-message-converters.js';
import {
  DEFAULT_AGENT_FEATURES,
  type AgentAbortHandle,
  type AgentExecutionMode,
  type AgentFeatureOptions,
  type AgentInterruptAction,
  type AgentProviders,
  type AgentThread,
  type ConversationMessageStore,
  type ConversationProvider,
  type ToolCallHandler,
  type CreateAgentProvidersOptions,
  type SavedAssistantMessage,
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

const clone = <T extends object>(value: T): T => ({ ...value });

interface MemoryConversationOptions {
  sessionId?: string;
  identity?: ConversationProvider['identity'];
  initialMessages?: AIMessageInput[];
}

class MemoryConversationState {
  public readonly sessionId: string;
  public readonly messages: StoredMessage[] = [];
  public readonly toolCalls = new Map<string, AIToolMessage>();
  public thread = 0;
  private nextId = 1;

  public constructor(options: MemoryConversationOptions) {
    this.sessionId =
      options.identity?.sessionId ??
      options.sessionId ??
      `agent-${crypto.randomUUID()}`;
    for (const message of options.initialMessages ?? []) {
      this.messages.push(this.toStored(message));
    }
  }

  public add(input: AIMessageInput): StoredMessage;
  public add(input: AIMessageInput[]): StoredMessage[];
  public add(
    input: AIMessageInput | AIMessageInput[],
  ): StoredMessage | StoredMessage[] {
    const values = (Array.isArray(input) ? input : [input]).map((message) =>
      this.toStored(message),
    );
    this.messages.push(...values);
    return Array.isArray(input) ? values : values[0];
  }

  public nextIdentifier(): string {
    return String(this.nextId++);
  }

  public toolKey(messageId: string, toolCallId: string): string {
    return `${messageId}:${toolCallId}`;
  }

  public getTool(messageId: string, toolCallId: string): AIToolMessage | null {
    return this.toolCalls.get(this.toolKey(messageId, toolCallId)) ?? null;
  }

  public updateTool(
    messageId: string,
    toolCallId: string,
    values: Partial<AIToolMessage>,
  ): number {
    const current = this.getTool(messageId, toolCallId);
    if (!current) return 0;
    Object.assign(current, values);
    return 1;
  }

  private toStored(message: AIMessageInput): StoredMessage {
    return {
      ...message,
      sessionId: this.sessionId,
      messageId: this.nextIdentifier(),
    } as StoredMessage;
  }
}

class MemoryConversationMessageStore implements ConversationMessageStore {
  public constructor(private readonly state: MemoryConversationState) {}

  public async loadMessages(messageId?: string): Promise<StoredMessage[]> {
    return messageId
      ? this.state.messages
          .filter((message) => String(message.messageId) < String(messageId))
          .map(clone)
      : this.state.messages.map(clone);
  }
  public async saveUserMessages(
    values: AIMessageInput[],
    messageId?: string,
    agentThread?: AgentThread,
  ): Promise<void> {
    if (agentThread) {
      this.state.thread = Math.max(this.state.thread, agentThread.thread);
    }
    if (messageId) {
      const index = this.state.messages.findIndex(
        (message) => String(message.messageId) >= String(messageId),
      );
      if (index >= 0) this.state.messages.splice(index);
    }
    this.state.add(values);
  }

  public async saveAssistantMessage(
    message: AIMessageInput,
  ): Promise<SavedAssistantMessage> {
    const saved = this.state.add(message);
    const initializedToolCalls = (saved.toolCalls ?? []).map((call) => {
      const value = {
        id: this.state.nextIdentifier(),
        sessionId: this.state.sessionId,
        messageId: String(saved.messageId),
        toolCallId: call.id,
        toolName: call.name,
        invokeStatus: 'init',
        status: null,
        content: null,
        auto: false,
        execution: 'backend',
      } as unknown as AIToolMessage;
      this.state.toolCalls.set(
        this.state.toolKey(String(saved.messageId), call.id),
        value,
      );
      return value;
    });
    return { message: saved, initializedToolCalls };
  }

  public async saveToolMessages(
    sourceMessageId: string,
    values: AIMessageInput[],
  ): Promise<void> {
    if (!values.length) return;
    const ids = values.map((message) => {
      const toolCallId = message.metadata?.toolCallId;
      if (typeof toolCallId !== 'string' || !toolCallId) {
        throw new Error('Tool message requires metadata.toolCallId');
      }
      return toolCallId;
    });
    this.state.add(values);
    for (const id of ids) {
      this.state.updateTool(sourceMessageId, id, {
        invokeStatus: 'confirmed',
      });
    }
  }

  public async currentThread(): Promise<AgentThread> {
    return this.thread();
  }

  public async forkThread(
    _provider: Parameters<ConversationMessageStore['forkThread']>[0],
    _checkpointer: Parameters<ConversationMessageStore['forkThread']>[1],
  ): Promise<AgentThread> {
    this.state.thread += 1;
    return this.thread();
  }

  public async updateThread(value: AgentThread): Promise<void> {
    this.state.thread = Math.max(this.state.thread, value.thread);
  }

  private thread(): AgentThread {
    return {
      sessionId: this.state.sessionId,
      thread: this.state.thread,
      threadId: `${this.state.sessionId}:${this.state.thread}`,
    };
  }
}

class MemoryToolCallHandler implements ToolCallHandler {
  public constructor(private readonly state: MemoryConversationState) {}

  public async markInterrupted(
    _sessionId: string,
    messageId: string,
    toolCallId: string,
    interruptId: string,
    interruptAction: AgentInterruptAction,
  ): Promise<number> {
    return this.state.updateTool(messageId, toolCallId, {
      invokeStatus: 'interrupted',
      interruptAction,
      interruptId,
    } as Partial<AIToolMessage>);
  }

  public async markPending(
    messageId: string,
    toolCallId: string,
  ): Promise<number> {
    return this.state.updateTool(messageId, toolCallId, {
      invokeStatus: 'pending',
      invokeStartTime: new Date(),
    });
  }

  public async markDone(
    messageId: string,
    toolCallId: string,
    result: unknown,
  ): Promise<number> {
    const value =
      typeof result === 'object' && result !== null
        ? (result as Record<string, unknown>)
        : undefined;
    return this.state.updateTool(messageId, toolCallId, {
      invokeStatus: 'done',
      invokeEndTime: new Date(),
      status: typeof value?.status === 'string' ? value.status : 'success',
      content: value?.content ?? result,
    });
  }

  public async markError(
    messageId: string,
    toolCallId: string,
    error: unknown,
  ): Promise<number> {
    return this.state.updateTool(messageId, toolCallId, {
      invokeStatus: 'done',
      invokeEndTime: new Date(),
      status: 'error',
      content: error instanceof Error ? error.message : error,
    });
  }

  public async cancel(): Promise<AIMessageInput[] | undefined> {
    return undefined;
  }

  public async get(
    messageId: string,
    toolCallId: string,
  ): Promise<AIToolMessage | null> {
    return this.state.getTool(messageId, toolCallId);
  }

  public async getMany(
    messageId: string,
    ids: string[],
  ): Promise<Map<string, AIToolMessage>> {
    return new Map(
      ids.flatMap((id) => {
        const value = this.state.getTool(messageId, id);
        return value ? [[id, value] as const] : [];
      }),
    );
  }
}

const memoryStreamManager = {
  clear: async (): Promise<void> => {},
  append: async (): Promise<void> => {},
  async *stream(): AsyncGenerator<string, void, void> {},
} as unknown as LLMStreamCachedManager;

class MemoryConversationProvider implements ConversationProvider {
  public readonly identity: ConversationProvider['identity'];
  public readonly messages: ConversationMessageStore;
  public readonly toolCalls: ToolCallHandler;
  public readonly streamCache: LLMStreamCached;

  public constructor(options: MemoryConversationOptions) {
    const state = new MemoryConversationState(options);
    this.identity = options.identity ?? { sessionId: state.sessionId };
    this.messages = new MemoryConversationMessageStore(state);
    this.toolCalls = new MemoryToolCallHandler(state);
    this.streamCache = new LLMStreamCached(
      state.sessionId,
      memoryStreamManager,
    );
  }

  public async beforeExecution(_mode: AgentExecutionMode): Promise<void> {}
  public async afterExecution(
    _mode: AgentExecutionMode,
    _options?: { aborted?: boolean },
  ): Promise<void> {}
  public registerAbortHandle(_token: symbol, _handle: AgentAbortHandle): void {}
  public unregisterAbortHandle(_token: symbol): void {}
  public async updateAssistantResponseMetadata(
    _messageId: string,
    _metadata: Record<string, unknown>,
  ): Promise<void> {}
}

class DefaultAgentProviders implements AgentProviders {
  public readonly conversation: ConversationProvider;
  public readonly chatContext: AgentProviders['chatContext'];
  public readonly chatMessageConverters: AgentProviders['chatMessageConverters'];
  public readonly logger: Logger;
  public readonly features: AgentFeatureOptions;
  public readonly checkpointer: AgentProviders['checkpointer'];

  public constructor(options: CreateAgentProvidersOptions) {
    this.conversation =
      options.conversation ?? new MemoryConversationProvider({});
    this.chatContext = options.chatContext;
    this.logger = options.logger ?? noopLogger;
    this.chatMessageConverters =
      options.chatMessageConverters ?? new BaseChatMessageConverters();
    this.features = {
      ...DEFAULT_AGENT_FEATURES,
      ...(options.features ?? {}),
    };
    this.checkpointer = options.checkpointer;
  }
}

export function createMemoryConversationProvider(
  options: MemoryConversationOptions = {},
): ConversationProvider {
  return new MemoryConversationProvider(options);
}

/** @deprecated Construct a BaseChatMessageConverters directly. */
export const createDefaultChatMessageConverters =
  (): BaseChatMessageConverters => new BaseChatMessageConverters();

export function createAgentProviders(
  options: CreateAgentProvidersOptions,
): AgentProviders {
  return new DefaultAgentProviders(options);
}
