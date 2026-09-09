import type {
  AIMessage as StoredMessage,
  AIMessageInput,
  AIToolMessage,
} from '@nocobase/ai-employee';
import type { Logger } from '@nocobase/logging';
import type {
  AgentProviders,
  ConversationProvider,
  CreateAgentProvidersOptions,
} from './types.js';
import { BaseChatMessageConverters } from './chat-message-converters.js';
import { DEFAULT_AGENT_FEATURES } from './types.js';

const noopLogger = {
  level: 'silent',
  fatal: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  silent: () => undefined,
  child: () => noopLogger,
  bindings: () => ({}),
  flush: () => undefined,
  isLevelEnabled: () => false,
} as unknown as Logger;

const clone = <T extends object>(value: T): T => ({ ...value });

export function createMemoryConversationProvider(
  options: {
    sessionId?: string;
    identity?: ConversationProvider['identity'];
    initialMessages?: AIMessageInput[];
  } = {},
): ConversationProvider {
  const sessionId =
    options.identity?.sessionId ??
    options.sessionId ??
    `agent-${crypto.randomUUID()}`;
  const messages: StoredMessage[] = [];
  const toolCalls = new Map<string, AIToolMessage>();
  let nextId = 1;
  let thread = 0;
  const toStored = (message: AIMessageInput): StoredMessage =>
    ({
      ...message,
      sessionId,
      messageId: String(nextId++),
    }) as StoredMessage;
  for (const message of options.initialMessages ?? [])
    messages.push(toStored(message));
  const key = (messageId: string, toolCallId: string) =>
    `${messageId}:${toolCallId}`;
  const getTool = (messageId: string, toolCallId: string) =>
    toolCalls.get(key(messageId, toolCallId)) ?? null;
  const updateTool = (
    messageId: string,
    toolCallId: string,
    values: Partial<AIToolMessage>,
  ) => {
    const current = getTool(messageId, toolCallId);
    if (!current) return 0;
    Object.assign(current, values);
    return 1;
  };
  const add = (input: AIMessageInput | AIMessageInput[]) => {
    const values = (Array.isArray(input) ? input : [input]).map(toStored);
    messages.push(...values);
    return Array.isArray(input) ? values : values[0];
  };
  const provider: ConversationProvider = {
    identity: options.identity ?? { sessionId },
    messages: {
      load: async (messageId) =>
        messageId
          ? messages
              .filter(
                (message) => String(message.messageId) < String(messageId),
              )
              .map(clone)
          : messages.map(clone),
      get: async (messageId) =>
        messages.find(
          (message) => String(message.messageId) === String(messageId),
        ) ?? null,
      add: (async (input: AIMessageInput | AIMessageInput[]) =>
        add(input)) as unknown as ConversationProvider['messages']['add'],
      remove: async (messageId) => {
        const index = messageId
          ? messages.findIndex(
              (message) => String(message.messageId) >= String(messageId),
            )
          : 0;
        if (index >= 0) messages.splice(index);
      },
      saveUserMessages: async (messageId, values, agentThread) => {
        if (agentThread) thread = Math.max(thread, agentThread.thread);
        if (messageId) {
          const index = messages.findIndex(
            (message) => String(message.messageId) >= String(messageId),
          );
          if (index >= 0) messages.splice(index);
        }
        add(values);
      },
      saveAssistantMessage: async (message) => {
        const saved = add(message) as StoredMessage;
        const initializedToolCalls = (saved.toolCalls ?? []).map((call) => {
          const value = {
            id: String(nextId++),
            sessionId,
            messageId: String(saved.messageId),
            toolCallId: call.id,
            toolName: call.name,
            invokeStatus: 'init',
            status: null,
            content: null,
            auto: false,
            execution: 'backend',
          } as unknown as AIToolMessage;
          toolCalls.set(key(String(saved.messageId), call.id), value);
          return value;
        });
        return { message: saved, initializedToolCalls };
      },
      saveToolMessages: async (sourceMessageId, values) => {
        if (!values.length) return;
        const ids = values.map((message) => {
          const toolCallId = message.metadata?.toolCallId;
          if (typeof toolCallId !== 'string' || !toolCallId) {
            throw new Error('Tool message requires metadata.toolCallId');
          }
          return toolCallId;
        });
        add(values);
        for (const id of ids) {
          updateTool(sourceMessageId, id, { invokeStatus: 'confirmed' });
        }
      },
      saveInterruptedAssistantMessage: async (message) =>
        add(message) as StoredMessage,
      shouldLoadHistory: (request) => Boolean(request.messageId),
    },
    toolCalls: {
      markInterrupted: async (
        _sessionId,
        messageId,
        toolCallId,
        interruptId,
        interruptAction,
      ) =>
        updateTool(messageId, toolCallId, {
          invokeStatus: 'interrupted',
          interruptAction,
          interruptId,
        } as any),
      markPending: async (messageId, toolCallId) =>
        updateTool(messageId, toolCallId, {
          invokeStatus: 'pending',
          invokeStartTime: new Date(),
        }),
      markDone: async (messageId, toolCallId, result: any) =>
        updateTool(messageId, toolCallId, {
          invokeStatus: 'done',
          invokeEndTime: new Date(),
          status: result?.status ?? 'success',
          content: result?.content ?? result,
        }),
      markError: async (messageId, toolCallId, error: any) =>
        updateTool(messageId, toolCallId, {
          invokeStatus: 'done',
          invokeEndTime: new Date(),
          status: 'error',
          content: error?.message ?? error,
        }),
      reject: async (messageId, ids, reason = 'Tool call rejected') =>
        ids.reduce(
          (count, id) =>
            count +
            updateTool(messageId, id, {
              invokeStatus: 'confirmed',
              status: 'success',
              content: reason,
            }),
          0,
        ),
      cancel: async () => undefined,
      get: async (messageId, toolCallId) => getTool(messageId, toolCallId),
      getMany: async (messageId, ids) =>
        new Map(
          ids.flatMap((id) => {
            const value = getTool(messageId, id);
            return value ? [[id, value] as const] : [];
          }),
        ),
    },
    threads: {
      current: async () => ({
        sessionId,
        thread,
        threadId: `${sessionId}:${thread}`,
      }),
      fork: async () => ({
        sessionId,
        thread: ++thread,
        threadId: `${sessionId}:${thread}`,
      }),
      shouldFork: () => false,
      update: async (value) => {
        thread = Math.max(thread, value.thread);
      },
      buildInitialState: (history) => ({
        messageId: history
          .slice()
          .reverse()
          .find((message) => message.toolCalls?.length)?.messageId,
        lastMessageIndex: {
          lastHumanMessageIndex: history.filter(
            (message) => message.role === 'user',
          ).length,
          lastAIMessageIndex: history.filter(
            (message) =>
              message.role !== 'user' &&
              message.role !== 'tool' &&
              message.role !== 'system',
          ).length,
          lastToolMessageIndex: history.filter(
            (message) => message.role === 'tool',
          ).length,
          lastMessageIndex: history.length,
        },
      }),
      useCheckpointer: () => false,
    },
    streamCache: {
      append: async () => undefined,
      clear: async () => undefined,
      skipped: async () => undefined,
    },
    beforeExecution: async () => undefined,
    afterExecution: async () => undefined,
    registerAbortHandle: () => undefined,
    unregisterAbortHandle: () => undefined,
    updateAssistantResponseMetadata: async () => undefined,
    logger: noopLogger,
  };
  return provider;
}

/** @deprecated Construct a BaseChatMessageConverters directly. */
export const createDefaultChatMessageConverters =
  (): BaseChatMessageConverters => new BaseChatMessageConverters();

export function createAgentProviders(
  options: CreateAgentProvidersOptions,
): AgentProviders {
  return {
    conversation: options.conversation ?? createMemoryConversationProvider(),
    chatContext: options.chatContext,
    chatMessageConverters:
      options.chatMessageConverters ?? new BaseChatMessageConverters(),
    features: {
      ...DEFAULT_AGENT_FEATURES,
      ...(options.features ?? {}),
    },
    checkpointer: options.checkpointer,
  };
}
