import type {
  AIMessage as StoredMessage,
  AIMessageInput,
  AIToolMessage,
  ToolsEntity,
} from '@nocobase/ai-employee';
import { LLMStreamCached } from '../server/manager/llm-stream-cached-manager.js';
import type {
  AgentAbortController,
  AgentAbortHandle,
  AgentEventHandler,
  AgentExecutionMode,
  AgentInterruptAction,
  AgentThread,
  ConversationMessageStore,
  ConversationProvider,
  CurrentConversation,
  SavedAssistantMessage,
} from '../server/agent/types.js';

const clone = <T extends object>(value: T): T => ({ ...value });

interface TestConversationOptions {
  sessionId?: string;
  currentConversation?: CurrentConversation;
  initialMessages?: AIMessageInput[];
}

class TestConversationState {
  public readonly sessionId: string;
  public readonly messages: StoredMessage[] = [];
  public readonly toolCalls = new Map<string, AIToolMessage>();
  public thread = 0;
  private nextId = 1;

  public constructor(options: TestConversationOptions) {
    this.sessionId =
      options.currentConversation?.sessionId ??
      options.sessionId ??
      `agent-${crypto.randomUUID()}`;
    for (const message of options.initialMessages ?? []) {
      this.messages.push(this.convert(message));
    }
  }

  public add(input: AIMessageInput): StoredMessage;
  public add(input: AIMessageInput[]): StoredMessage[];
  public add(
    input: AIMessageInput | AIMessageInput[],
  ): StoredMessage | StoredMessage[] {
    const values = (Array.isArray(input) ? input : [input]).map((message) =>
      this.convert(message),
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

  public updateMessage(
    messageId: string,
    patch: Partial<AIMessageInput>,
  ): void {
    const message = this.messages.find(
      (item) => String(item.messageId) === String(messageId),
    );
    if (!message) return;
    const metadata = patch.metadata
      ? { ...message.metadata, ...patch.metadata }
      : message.metadata;
    Object.assign(message, patch, { metadata });
  }

  private convert(message: AIMessageInput): StoredMessage {
    return {
      ...message,
      sessionId: this.sessionId,
      messageId: this.nextIdentifier(),
    } as StoredMessage;
  }
}

class TestConversationMessageStore implements ConversationMessageStore {
  public constructor(private readonly state: TestConversationState) {}

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
    _toolMap: ReadonlyMap<string, ToolsEntity>,
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

  public async updateMessage(
    messageId: string,
    patch: Partial<AIMessageInput>,
  ): Promise<void> {
    this.state.updateMessage(messageId, patch);
  }

  public async currentThread(): Promise<AgentThread> {
    return this.thread();
  }

  public async updateToolInterrupted(
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

  public async updateToolPending(
    messageId: string,
    toolCallId: string,
  ): Promise<number> {
    return this.state.updateTool(messageId, toolCallId, {
      invokeStatus: 'pending',
      invokeStartTime: new Date(),
    });
  }

  public async updateToolDone(
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

  public updateToolError(
    messageId: string,
    toolCallId: string,
    error: unknown,
  ): Promise<number> {
    return this.updateToolDone(messageId, toolCallId, {
      status: 'error',
      content: error instanceof Error ? error.message : error,
    });
  }

  public async cancelToolCall(): Promise<AIMessageInput[] | undefined> {
    return undefined;
  }

  public getToolCallResult(
    messageId: string,
    toolCallId: string,
  ): Promise<AIToolMessage | null> {
    return Promise.resolve(this.state.getTool(messageId, toolCallId));
  }

  public async listToolCallResult(
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

  private thread(): AgentThread {
    return {
      sessionId: this.state.sessionId,
      thread: this.state.thread,
      threadId: `${this.state.sessionId}:${this.state.thread}`,
    };
  }
}

const testStreamManager = {
  clear: async (): Promise<void> => {},
  append: async (): Promise<void> => {},
  async *stream(): AsyncGenerator<string, void, void> {},
} as unknown as LLMStreamCachedManager;

class TestAgentEventHandler implements AgentEventHandler {
  public async beforeExecution(_mode: AgentExecutionMode): Promise<void> {}
  public async afterExecution(
    _mode: AgentExecutionMode,
    _options?: { aborted?: boolean },
  ): Promise<void> {}
}

class TestAgentAbortController implements AgentAbortController {
  public registerAbortHandle(_token: symbol, _handle: AgentAbortHandle): void {}
  public unregisterAbortHandle(_token: symbol): void {}
}
export class TestConversationProvider implements ConversationProvider {
  public readonly messages: ConversationMessageStore;
  public readonly streamCache: LLMStreamCached;
  public readonly event: AgentEventHandler;
  public readonly abort: AgentAbortController;

  public constructor(options: TestConversationOptions) {
    const state = new TestConversationState(options);
    this.event = new TestAgentEventHandler();
    this.abort = new TestAgentAbortController();
    this.messages = new TestConversationMessageStore(state);
    this.streamCache = new LLMStreamCached(state.sessionId, testStreamManager);
  }
}

export function createTestConversationProvider(
  options: TestConversationOptions = {},
): ConversationProvider {
  return new TestConversationProvider(options);
}
