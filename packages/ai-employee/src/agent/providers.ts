import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type {
  AIMessage as StoredMessage,
  AIMessageInput,
  AIToolCall,
  AIToolMessage,
} from '../ai-employees/types/index.js';
import type { ToolsEntity } from '../repository/tool.js';
import type {
  AgentProviderOverrides,
  AgentProviders,
  ChatContextProvider,
  ConversationProvider,
  CreateAgentProvidersOptions,
  ToolProvider,
} from './types.js';
import { AgentServiceError, DEFAULT_AGENT_FEATURES } from './types.js';

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
} as unknown as import('@nocobase/logging').Logger;

const clone = <T extends object>(value: T): T => ({ ...value });

const mergeConversation = (
  base: ConversationProvider,
  override = {} as NonNullable<AgentProviderOverrides['conversation']>,
): ConversationProvider => ({
  ...base,
  ...override,
  identity: override.identity ?? base.identity,
  messages: { ...base.messages, ...override.messages },
  toolCalls: { ...base.toolCalls, ...override.toolCalls },
  threads: { ...base.threads, ...override.threads },
  streamCache: { ...base.streamCache, ...override.streamCache },
});

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
      saveAssistantMessage: async (message, calls) => {
        const saved = add(message) as StoredMessage;
        const initialized = await provider.toolCalls.initialize(
          String(saved.messageId),
          calls,
        );
        return { message: saved, initializedToolCalls: initialized };
      },
      saveToolMessages: async (values, messageId, ids) => {
        add(values);
        await provider.toolCalls.confirm(messageId, ids);
      },
      saveInterruptedAssistantMessage: async (message) =>
        add(message) as StoredMessage,
      shouldLoadHistory: (request) => Boolean(request.messageId),
    },
    toolCalls: {
      initialize: async (messageId, calls) =>
        calls.map((call) => {
          const value = {
            id: String(nextId++),
            sessionId,
            messageId,
            toolCallId: call.id,
            toolName: call.name,
            invokeStatus: 'init',
            status: null,
            content: null,
            auto: false,
            execution: 'backend',
          } as unknown as AIToolMessage;
          toolCalls.set(key(messageId, call.id), value);
          return value;
        }),
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
      confirm: async (messageId, ids) =>
        ids.reduce(
          (count, id) =>
            count + updateTool(messageId, id, { invokeStatus: 'confirmed' }),
          0,
        ),
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
        messageId: history.findLast((message) => message.toolCalls?.length)
          ?.messageId,
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

export function createDefaultChatContextProvider(
  options: { systemPrompt?: string } = {},
): ChatContextProvider {
  return {
    normalizeMessages: async (messages) => messages,
    formatMessages: async (messages, context) =>
      messages.map((message) => {
        const rawContent = message.content?.content ?? '';
        const content = rawContent as any;
        if (message.role === 'user') return new HumanMessage({ content });
        if (message.role === 'tool')
          return new ToolMessage({
            content,
            tool_call_id: String(message.metadata?.toolCallId ?? ''),
          });
        if (message.role === 'system') return { role: 'system', content };
        return new AIMessage({
          content,
          tool_calls: message.toolCalls as any,
          response_metadata: message.metadata?.response_metadata,
          additional_kwargs:
            context.provider.prepareStoredAssistantAdditionalKwargs(
              message.metadata?.additional_kwargs ?? {},
            ),
        });
      }),
    getSystemPrompt: async () => options.systemPrompt,
    getExecutionContext: async (request) => request.context ?? {},
    getExecutionConfig: async () => ({}),
    convertAIMessage: (message, context) =>
      ({
        role: 'assistant',
        content: { type: 'text', content: message.content },
        toolCalls: message.tool_calls as AIToolCall[],
        metadata: {
          provider: context.providerName,
          llmService: context.llmService,
          model: context.model,
          additional_kwargs:
            context.provider.prepareStoredAssistantAdditionalKwargs(
              message.additional_kwargs,
            ),
        },
      }) as AIMessageInput,
    convertHumanMessage: (message, context) =>
      ({
        role: 'user',
        content: { type: 'text', content: message.content },
        metadata: {
          provider: context.providerName,
          llmService: context.llmService,
          model: context.model,
        },
      }) as AIMessageInput,
    convertToolMessage: (message, context) =>
      ({
        role: 'tool',
        content: { type: 'text', content: message.content },
        metadata: {
          provider: context.providerName,
          llmService: context.llmService,
          model: context.model,
          toolCallId: message.tool_call_id,
        },
      }) as AIMessageInput,
    getUserMessageCount: (request) =>
      (request.userMessages ?? []).filter((message) => message.role === 'user')
        .length,
  };
}

export function createDefaultToolProvider(
  tools: ToolsEntity[] = [],
): ToolProvider {
  return {
    listTools: async () => tools,
    getBaseToolNames: async (values) =>
      new Set(values.map((tool) => tool.definition.name)),
    getActivatedSkillToolNames: async () => new Set(),
    getToolsMap: async () =>
      new Map(tools.map((tool) => [tool.definition.name, tool])),
    shouldInterruptToolCall: () => false,
    isAutoCall: () => true,
  };
}

export function createAgentProviders(
  options: CreateAgentProvidersOptions,
): AgentProviders {
  if (!options.llmProvider) {
    throw new AgentServiceError(
      'PROVIDER_ERROR',
      'An LLM provider is required',
    );
  }
  const conversation = mergeConversation(
    options.conversation ?? createMemoryConversationProvider(),
    options.overrides?.conversation,
  );
  const chatContext = {
    ...(options.chatContext ?? createDefaultChatContextProvider()),
    ...(options.overrides?.chatContext ?? {}),
  };
  const tools = {
    ...(options.tools ?? createDefaultToolProvider()),
    ...(options.overrides?.tools ?? {}),
  };
  const features = {
    ...DEFAULT_AGENT_FEATURES,
    ...(options.features ?? {}),
    ...(options.overrides?.features ?? {}),
  };
  return {
    conversation,
    chatContext,
    tools,
    llmProvider: options.llmProvider,
    llmIdentity: options.llmIdentity,
    features,
    checkpointer: options.overrides?.checkpointer ?? options.checkpointer,
  };
}
