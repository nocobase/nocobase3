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
import { NativeCollectionSaver } from '../../agent/ai-employee/checkpoints/index.js';
import { createAIChatConversation } from './ai-chat-conversation.js';
import type { DatabaseConnection } from '@nocobase/db';
import {
  convertAIMessage,
  convertHumanMessage,
  convertToolMessage,
} from '../../agent/ai-employee/utils.js';
import type { LLMProvider } from '@nocobase/ai-employee';
import { createAgentProviders } from '../providers.js';
import {
  AIEmployeeCapabilities,
  type AIEmployeeAgentRuntimeOptions,
} from './runtime.js';

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
  cancelToolCall(): Promise<any>;
  getToolCallHandler(): ToolCallHandler;
}

export interface AIEmployeeAgentProvidersResult {
  providers: AgentProviders;
  facade: AIEmployeeAgentFacade;
}

interface AIEmployeeProviderState {
  options: AIEmployeeAgentRuntimeOptions;
  runtime: AIEmployeeCapabilities;
  activeProvider?: LLMProvider;
  activeIdentity?: AgentLLMIdentity;
  responseMetadata: Map<string, any>;
}

const createState = (
  options: AIEmployeeAgentRuntimeOptions,
): AIEmployeeProviderState => ({
  options,
  runtime: new AIEmployeeCapabilities(options),
  responseMetadata: new Map(),
});

function getRequiredModel(
  options: AIEmployeeAgentRuntimeOptions,
): NonNullable<AIEmployeeAgentRuntimeOptions['model']> {
  if (!options.model) {
    throw new Error('AI employee model is required');
  }
  return options.model;
}

async function resolveAIEmployeeLLM(
  options: AIEmployeeAgentRuntimeOptions,
  state: AIEmployeeProviderState,
): Promise<{ provider: LLMProvider; identity: AgentLLMIdentity }> {
  const resolved =
    await options.agentContext.ai.llmProviderManager.getLLMService(
      getRequiredModel(options),
    );
  const identity: AgentLLMIdentity = {
    providerName: resolved.service.provider,
    llmService: resolved.service.name,
    model: resolved.model,
    getResponseMetadata: (id) => state.responseMetadata.get(id),
  };
  state.activeProvider = resolved.provider;
  state.activeIdentity = identity;
  return { provider: resolved.provider, identity };
}

export function createAIEmployeeConversationProvider(
  options: AIEmployeeAgentRuntimeOptions,
  state = createState(options),
): ConversationProvider {
  const { runtime } = state;
  const agentContext = options.agentContext;
  const database = options.database;
  const sessionId = options.sessionId;
  const chatConversation = createAIChatConversation({
    repositories: options.repositories,
    database,
    snowflake: options.snowflake,
    sessionId,
  });
  const from = options.from ?? 'main-agent';
  const username = String(options.employee.username ?? '');
  const cache = options.llmStreamCachedManager.getCached(sessionId);
  const toolCalls: ToolCallHandler = {
    initialize: async (messageId, calls) =>
      database.transaction((transaction: DatabaseConnection) =>
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
      database.transaction((transaction: DatabaseConnection) =>
        runtime.confirmToolCall(transaction, messageId, ids),
      ),
    reject: async (_messageId, ids, reason) => {
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
      load: (messageId) => chatConversation.listMessages({ messageId }),
      get: (messageId) => chatConversation.getMessage(messageId),
      add: ((messages: any) =>
        chatConversation.addMessages(
          messages,
        )) as ConversationProvider['messages']['add'],
      remove: (messageId) => chatConversation.removeMessages({ messageId }),
      saveUserMessages: async (messageId, messages, thread) =>
        chatConversation.withTransaction(async (target, transaction) => {
          if (thread) await runtime.updateThread(transaction, thread);
          if (messageId && (await target.getMessage(messageId)))
            await target.removeMessages({ messageId });
          if (messages.length) await target.addMessages(messages);
        }),
      saveAssistantMessage: async (message, calls) =>
        chatConversation.withTransaction(async (target, transaction) => {
          const saved = await target.addMessages(message);
          const initialized = calls.length
            ? await runtime.initToolCall(transaction, saved.messageId, calls)
            : [];
          return {
            message: saved,
            initializedToolCalls: initialized,
          };
        }),
      saveToolMessages: async (messages, messageId, ids) =>
        chatConversation.withTransaction(async (target, transaction) => {
          await target.addMessages(messages);
          await runtime.confirmToolCall(transaction, messageId, ids);
        }),
      saveInterruptedAssistantMessage: (message) =>
        chatConversation.withTransaction((target) =>
          target.addMessages(message),
        ),
      shouldLoadHistory: (request) =>
        Boolean(request.messageId) || options.legacy === true,
    },
    threads: {
      current: async () => {
        const target = await options.repositories.aiConversations.findOne({
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
            checkpoints: options.repositories.lcCheckpoints,
            blobs: options.repositories.lcCheckpointBlobs,
            writes: options.repositories.lcCheckpointWrites,
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
        await options.repositories.aiConversations.update({
          values: { thread: thread.thread },
          filter: { sessionId, thread: { $lt: thread.thread } },
        });
      },
      buildInitialState: (messages) => {
        const toolMessage = messages
          .slice()
          .reverse()
          .find((message) => message.toolCalls?.length);
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
    beforeExecution: async (mode) => {
      await options.repositories.aiConversations.update({
        values: { llmActiveState: mode },
        filter: { sessionId },
      });
    },
    afterExecution: async (mode, result) => {
      await options.repositories.aiConversations.update({
        values: {
          llmActiveState: 'idle',
          ...(mode === 'streaming'
            ? { read: result?.aborted ? true : false }
            : {}),
        },
        filter: { sessionId },
      });
    },
    registerAbortHandle: (token: symbol, handle: AgentAbortHandle) =>
      options.aiEmployeesManager.registerAgentAbortHandle(
        sessionId,
        token,
        handle,
      ),
    unregisterAbortHandle: (token: symbol) =>
      options.aiEmployeesManager.unregisterAgentAbortHandle(sessionId, token),
    streamCache: {
      append: (chunk) => cache.append(chunk),
      clear: () => cache.clear(),
      skipped: () => cache.skipped(),
    },
    updateAssistantResponseMetadata: async (messageId, metadata) => {
      const message = await options.repositories.aiMessages.findOne({
        filter: { sessionId, messageId },
      });
      if (message) {
        await options.repositories.aiMessages.update({
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
    logger: agentContext.logger,
  };
  return conversation;
}

export function createAIEmployeeToolProvider(
  options: AIEmployeeAgentRuntimeOptions,
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
  options: AIEmployeeAgentRuntimeOptions,
  state = createState(options),
): ChatContextProvider {
  const { runtime, responseMetadata } = state;
  return {
    formatMessages: (messages, model) =>
      runtime.formatMessages({ messages, provider: model.provider }),
    getSystemPrompt: (messages) => runtime.getSystemPrompt(messages),
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
  };
}

export async function createAIEmployeeAgentProviders(
  options: AIEmployeeAgentRuntimeOptions,
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
            checkpoints: options.repositories.lcCheckpoints,
            blobs: options.repositories.lcCheckpointBlobs,
            writes: options.repositories.lcCheckpointWrites,
          }),
    overrides,
  });
  return {
    providers,
    facade: {
      cancelToolCall: () => state.runtime.cancelToolCall(),
      getToolCallHandler: () => conversation.toolCalls,
    },
  };
}
