import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import {
  createAgent,
  type AIMessage as LangChainAIMessage,
  type HumanMessage,
  type ToolMessage,
} from 'langchain';
import type {
  AgentAbortHandle,
  AgentProviderOverrides,
  AgentProviders,
  AgentThread,
  ChatContextProvider,
  ConversationProvider,
  AgentLLMIdentity,
  ToolCallHandler,
  ToolProvider,
} from '../types.js';
import { NativeCollectionSaver } from '../../ai-employees/checkpoints/index.js';
import type { AIMessageInput } from '../../ai-employees/types/index.js';
import {
  convertAIMessage,
  convertHumanMessage,
  convertToolMessage,
} from '../../ai-employees/utils.js';
import type { LLMProvider } from '../../llm-providers/provider.js';
import { createAgentProviders } from '../providers.js';
import { AIEmployeeCapabilities, type AIEmployeeOptions } from './runtime.js';

class ResponseMetadataCollector extends BaseCallbackHandler {
  name = 'ResponseMetadataCollector';
  constructor(
    private provider: LLMProvider,
    private metadata: Map<string, any>,
  ) {
    super();
  }
  handleLLMEnd(output: LLMResult): void {
    const [id, data] = this.provider.parseResponseMetadata(output);
    if (id && data) this.metadata.set(id, data);
  }
}

export interface AIEmployeeAgentFacade {
  getFormatMessages(messages: AIMessageInput[]): Promise<unknown[]>;
  cancelToolCall(): Promise<any>;
  getToolCallHandler(): ToolCallHandler;
}

export interface AIEmployeeAgentProvidersResult {
  providers: AgentProviders;
  facade: AIEmployeeAgentFacade;
}

interface AIEmployeeProviderState {
  options: AIEmployeeOptions;
  runtime: AIEmployeeCapabilities;
  activeProvider?: LLMProvider;
  activeIdentity?: AgentLLMIdentity;
  responseMetadata: Map<string, any>;
}

const createState = (options: AIEmployeeOptions): AIEmployeeProviderState => ({
  options,
  runtime: new AIEmployeeCapabilities(options),
  responseMetadata: new Map(),
});

async function resolveAIEmployeeLLM(
  options: AIEmployeeOptions,
  state: AIEmployeeProviderState,
): Promise<{ provider: LLMProvider; identity: AgentLLMIdentity }> {
  const resolved = await options.ctx.ai.llmProviderManager.getLLMService({
    ...options.model,
  });
  const identity: AgentLLMIdentity = {
    providerName: resolved.service.provider,
    llmService:
      resolved.service.get?.('name') || (resolved.service as any).name,
    model: resolved.model,
    getResponseMetadata: (id) => state.responseMetadata.get(id),
  };
  state.activeProvider = resolved.provider;
  state.activeIdentity = identity;
  return { provider: resolved.provider, identity };
}

export function createAIEmployeeConversationProvider(
  options: AIEmployeeOptions,
  state = createState(options),
): ConversationProvider {
  const { runtime } = state;
  const ctx = options.ctx as any;
  const sessionId = options.sessionId;
  const from = options.from ?? 'main-agent';
  const username = String(options.employee.username ?? '');
  const cache = ctx.llmStreamCachedManager.getCached(sessionId);
  const toolCalls: ToolCallHandler = {
    initialize: async (messageId, calls) =>
      ctx.database.transaction((transaction) =>
        runtime.initToolCall(transaction, messageId, calls),
      ),
    markInterrupted: (...args) => runtime.updateToolCallInterrupted(...args),
    markPending: (...args) => runtime.updateToolCallPending(...args),
    markDone: (...args) => runtime.updateToolCallDone(...args),
    markError: (messageId, toolCallId, error) =>
      runtime.updateToolCallDone(messageId, toolCallId, {
        status: 'error',
        content: (error as any)?.message ?? error,
      }),
    confirm: async (messageId, ids) =>
      ctx.database.transaction((transaction) =>
        runtime.confirmToolCall(transaction, messageId, ids),
      ),
    reject: async (messageId, ids, reason) => {
      await runtime.cancelToolCall(reason);
      return ids.length;
    },
    get: (...args) => runtime.getToolCallResult(...args),
    getMany: (...args) => runtime.getToolCallResultMap(...args),
    cancel: async () => {
      await runtime.cancelToolCall();
      return [];
    },
  };
  const conversation: ConversationProvider = {
    identity: { sessionId, from, username, metadata: { kind: 'ai-employee' } },
    toolCalls,
    messages: {
      load: (messageId) =>
        runtime.aiChatConversation.listMessages({ messageId }),
      get: (messageId) => runtime.aiChatConversation.getMessage(messageId),
      add: ((messages: any) =>
        runtime.aiChatConversation.addMessages(
          messages,
        )) as ConversationProvider['messages']['add'],
      remove: (messageId) =>
        runtime.aiChatConversation.removeMessages({ messageId }),
      saveUserMessages: async (messageId, messages, thread) =>
        runtime.aiChatConversation.withTransaction(
          async (target, transaction) => {
            if (thread) await runtime.updateThread(transaction, thread);
            if (messageId && (await target.getMessage(messageId)))
              await target.removeMessages({ messageId });
            if (messages.length) await target.addMessages(messages);
          },
        ),
      saveAssistantMessage: async (message, calls) =>
        runtime.aiChatConversation.withTransaction(
          async (target, transaction) => {
            const saved = await target.addMessages(message);
            const initialized = calls.length
              ? await runtime.initToolCall(transaction, saved.messageId, calls)
              : [];
            return {
              message: saved,
              initializedToolCalls: initialized,
            };
          },
        ),
      saveToolMessages: async (messages, messageId, ids) =>
        runtime.aiChatConversation.withTransaction(
          async (target, transaction) => {
            await target.addMessages(messages);
            await runtime.confirmToolCall(transaction, messageId, ids);
          },
        ),
      saveInterruptedAssistantMessage: (message) =>
        runtime.aiChatConversation.withTransaction((target) =>
          target.addMessages(message),
        ),
      shouldLoadHistory: (request) =>
        Boolean(request.messageId) || options.legacy === true,
    },
    threads: {
      current: async () => {
        const target = await ctx.repositories.aiConversations.findOne({
          filter: { sessionId },
        });
        if (!target) throw new Error('Conversation not existed');
        const thread = target.thread ?? 0;
        return { sessionId, thread, threadId: `${sessionId}:${thread}` };
      },
      fork: async (llmProvider) => {
        const current = await conversation.threads.current();
        if (!current) return undefined;
        for (let attempt = 0; attempt < 4; attempt++) {
          const thread = current.thread + attempt + 1;
          const candidate = {
            sessionId,
            thread,
            threadId: `${sessionId}:${thread}`,
          };
          const saver = new NativeCollectionSaver({
            checkpoints: ctx.repositories.lcCheckpoints,
            blobs: ctx.repositories.lcCheckpointBlobs,
            writes: ctx.repositories.lcCheckpointWrites,
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
      },
      shouldFork: (operation, request) =>
        operation === 'fork' ||
        (Boolean(request.messageId) && options.legacy !== true),
      update: async (thread: AgentThread) => {
        await ctx.repositories.aiConversations.update({
          values: { thread: thread.thread },
          filter: { sessionId, thread: { $lt: thread.thread } },
        });
      },
      buildInitialState: (messages) => {
        const toolMessage = messages.findLast(
          (message) => message.toolCalls?.length,
        );
        return {
          messageId: toolMessage?.messageId,
          lastMessageIndex: {
            lastHumanMessageIndex: messages.filter(
              (message) => message.role === 'user',
            ).length,
            lastAIMessageIndex: messages.filter(
              (message) => message.role === username,
            ).length,
            lastToolMessageIndex: messages.filter(
              (message) => message.role === 'tool',
            ).length,
            lastMessageIndex: messages.length,
          },
        };
      },
      useCheckpointer: () => from === 'main-agent',
    },
    beforeExecution: async (mode) =>
      ctx.repositories.aiConversations.update({
        values: { llmActiveState: mode },
        filter: { sessionId },
      }),
    afterExecution: async (mode, result) =>
      ctx.repositories.aiConversations.update({
        values: {
          llmActiveState: 'idle',
          ...(mode === 'streaming'
            ? { read: result?.aborted ? true : false }
            : {}),
        },
        filter: { sessionId },
      }),
    registerAbortHandle: (token: symbol, handle: AgentAbortHandle) =>
      ctx.aiEmployeesManager.registerAgentAbortHandle(sessionId, token, handle),
    unregisterAbortHandle: (token: symbol) =>
      ctx.aiEmployeesManager.unregisterAgentAbortHandle(sessionId, token),
    streamCache: {
      append: (chunk) => cache.append(chunk),
      clear: () => cache.clear(),
      skipped: () => cache.skipped(),
    },
    updateAssistantResponseMetadata: async (messageId, metadata) => {
      const message = await ctx.repositories.aiMessages.findOne({
        filter: { sessionId, messageId },
      });
      if (message) {
        await ctx.repositories.aiMessages.update({
          values: {
            metadata: {
              ...(message.metadata ?? {}),
              response_metadata: {
                ...(message.metadata?.response_metadata ?? {}),
                ...metadata,
              },
            },
          },
          filter: { sessionId, messageId },
        });
      }
    },
    logger: ctx.logger,
  };
  return conversation;
}

export function createAIEmployeeToolProvider(
  options: AIEmployeeOptions,
  state = createState(options),
): ToolProvider {
  const { runtime } = state;
  return {
    listTools: () => runtime.getAgentTools().then((result) => result.tools),
    getBaseToolNames: () =>
      runtime.getAgentTools().then((result) => result.baseToolNames),
    getActivatedSkillToolNames: () => runtime.getActivatedSkillToolNames(),
    getToolsMap: () => runtime.getToolsMap(),
    shouldInterruptToolCall: (tool) => runtime.shouldInterruptToolCall(tool),
    isAutoCall: (tool) => runtime.isAutoCall(tool),
  };
}

export function createAIEmployeeChatContextProvider(
  options: AIEmployeeOptions,
  state = createState(options),
): ChatContextProvider {
  const { runtime, responseMetadata } = state;
  return {
    normalizeMessages: (messages) => runtime.normalizeMessages(messages),
    formatMessages: (messages, model) =>
      runtime.formatMessages({ messages, provider: model.provider }),
    getSystemPrompt: (messages) => runtime.getSystemPrompt(messages),
    getExecutionContext: async (request) => ({
      ctx: options.ctx,
      ...(request.context ?? {}),
    }),
    getExecutionConfig: async () => ({
      callbacks: state.activeProvider
        ? [
            new ResponseMetadataCollector(
              state.activeProvider,
              responseMetadata,
            ),
          ]
        : [],
    }),
    convertAIMessage: (message: LangChainAIMessage, prepared) =>
      convertAIMessage({
        aiEmployee: runtime,
        providerName: prepared.providerName,
        provider: prepared.provider,
        llmService: prepared.llmService,
        model: prepared.model,
        aiMessage: message,
      }),
    convertHumanMessage: (message: HumanMessage, prepared) =>
      convertHumanMessage({
        providerName: prepared.providerName,
        llmService: prepared.llmService,
        model: prepared.model,
        humanMessage: message,
      }),
    convertToolMessage: (message: ToolMessage, prepared) =>
      convertToolMessage({
        providerName: prepared.providerName,
        llmService: prepared.llmService,
        model: prepared.model,
        toolMessage: message,
      }),
    getUserMessageCount: (request) =>
      (request.userMessages ?? []).filter((message) => message.role === 'user')
        .length,
  };
}

export async function createAIEmployeeAgentProviders(
  options: AIEmployeeOptions,
  overrides?: AgentProviderOverrides,
): Promise<AIEmployeeAgentProvidersResult> {
  const state = createState(options);
  const llm = await resolveAIEmployeeLLM(options, state);
  const conversation = createAIEmployeeConversationProvider(options, state);
  const chatContext = createAIEmployeeChatContextProvider(options, state);
  const tools = createAIEmployeeToolProvider(options, state);
  const providers = createAgentProviders({
    llmProvider: llm.provider,
    llmIdentity: llm.identity,
    conversation,
    chatContext,
    tools,
    checkpointer:
      options.from === 'sub-agent'
        ? undefined
        : new NativeCollectionSaver({
            checkpoints: options.ctx.repositories.lcCheckpoints,
            blobs: options.ctx.repositories.lcCheckpointBlobs,
            writes: options.ctx.repositories.lcCheckpointWrites,
          }),
    overrides,
  });
  return {
    providers,
    facade: {
      getFormatMessages: (messages) => runtimeFormat(state, messages),
      cancelToolCall: () => state.runtime.cancelToolCall(),
      getToolCallHandler: () => conversation.toolCalls,
    },
  };
}

const runtimeFormat = async (
  state: AIEmployeeProviderState,
  messages: AIMessageInput[],
) => {
  const provider =
    state.activeProvider ??
    (await resolveAIEmployeeLLM(state.options, state)).provider;
  return state.runtime.formatMessages({ messages, provider });
};
