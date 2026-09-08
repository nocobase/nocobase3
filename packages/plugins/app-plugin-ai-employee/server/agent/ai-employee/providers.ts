import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import { createAgent } from 'langchain';
import type {
  AgentAbortHandle,
  AgentProviderOverrides,
  AgentProviders,
  AgentRequest,
  AgentThread,
  ConversationProvider,
  ResolvedAgentLLM,
  ToolCallHandler,
  ToolProvider,
} from '../types.js';
import { BaseChatContextProvider } from '../chat-context.js';
import { AIEmployeeChatMessageConverters } from './message-converters.js';
import { NativeCollectionSaver } from '../../agent/ai-employee/checkpoints/index.js';
import { createAIChatConversation } from './ai-chat-conversation.js';
import type { DatabaseConnection } from '@nocobase/db';
import type {
  AIEmployee as AIEmployeeType,
  AIMessageInput,
  LLMProvider,
} from '@nocobase/ai-employee';
import { createAgentProviders } from '../providers.js';
import {
  AIEmployeeCapabilities,
  type AIEmployeeAgentRuntimeOptions,
} from './runtime.js';
import { getSystemPrompt } from './prompts.js';
import {
  getKnowledgeBaseBackgroundPrompt,
  normalizeKnowledgeBaseRetrievalStrategy,
} from '../../manager/knowledge-base-manager.js';
import type { ToolCallPolicy } from './tool-call-policy.js';
import { EXECUTE_FRONTEND_TOOL_NAME } from './common/frontend-tools.js';
import {
  listCurrentFrontendTools,
  shouldAutoExecuteFrontendTool,
} from './frontend-tools.js';

class ExecutionResponseMetadata {
  private readonly metadata = new Map<string, Record<string, unknown>>();
  private disposed = false;

  public collect(id: unknown, data: unknown): void {
    if (this.disposed || !id || !data || typeof data !== 'object') {
      return;
    }
    this.metadata.set(String(id), data as Record<string, unknown>);
  }

  public take(id: string): Record<string, unknown> | undefined {
    const data = this.metadata.get(id);
    this.metadata.delete(id);
    return data;
  }

  public dispose(): void {
    this.disposed = true;
    this.metadata.clear();
  }
}

class ResponseMetadataCollector extends BaseCallbackHandler {
  public name = 'ResponseMetadataCollector';

  public constructor(
    private readonly provider: LLMProvider,
    private readonly metadata: ExecutionResponseMetadata,
  ) {
    super();
  }

  public handleLLMEnd(output: LLMResult): void {
    const [id, data] = this.provider.parseResponseMetadata(output);
    this.metadata.collect(id, data);
  }
}

const responseMetadataCollector = Symbol('responseMetadataCollector');

type AIEmployeeResolvedAgentLLM = ResolvedAgentLLM & {
  readonly [responseMetadataCollector]: ResponseMetadataCollector;
};

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
}

const createState = (
  options: AIEmployeeAgentRuntimeOptions,
): AIEmployeeProviderState => ({
  options,
  runtime: new AIEmployeeCapabilities(options),
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
): Promise<AIEmployeeResolvedAgentLLM> {
  const resolved =
    await options.agentContext.ai.llmProviderManager.getLLMService(
      getRequiredModel(options),
    );
  const metadata = new ExecutionResponseMetadata();
  const collector = new ResponseMetadataCollector(resolved.provider, metadata);
  return {
    providerName: resolved.service.provider,
    llmService: resolved.service.name,
    model: resolved.model,
    provider: resolved.provider,
    takeResponseMetadata: (id) => metadata.take(id),
    dispose: () => metadata.dispose(),
    [responseMetadataCollector]: collector,
  };
}

async function initializeToolCalls(
  options: AIEmployeeAgentRuntimeOptions,
  policy: ToolCallPolicy,
  transaction: DatabaseConnection,
  messageId: string,
  toolCalls: { id: string; name: string; args: unknown }[],
) {
  const now = new Date();
  const toolsMap = await policy.getToolsMap();
  return options.repositories.aiToolMessages.create(
    {
      values: await Promise.all(
        toolCalls.map(async (toolCall) => {
          const tool = toolsMap.get(toolCall.name);
          const exists = Boolean(tool);
          return {
            id: options.snowflake.generate(),
            sessionId: options.sessionId,
            messageId,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            status: exists ? (null as unknown as string) : 'error',
            content: exists
              ? (null as unknown as string)
              : `Tool ${toolCall.name} not found`,
            invokeStatus: exists ? 'init' : 'done',
            invokeStartTime: exists ? (null as unknown as Date) : now,
            invokeEndTime: exists ? (null as unknown as Date) : now,
            auto: await policy.isAutoCall(tool, toolCall.args),
            execution: tool?.execution ?? 'backend',
          };
        }),
      ),
    },
    { connection: transaction },
  );
}

export function createAIEmployeeConversationProvider(
  options: AIEmployeeAgentRuntimeOptions,
  state = createState(options),
  toolCallPolicy?: ToolCallPolicy,
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
        toolCallPolicy
          ? initializeToolCalls(
              options,
              toolCallPolicy,
              transaction,
              messageId,
              calls,
            )
          : runtime.initToolCall(transaction, messageId, calls),
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
            ? toolCallPolicy
              ? await initializeToolCalls(
                  options,
                  toolCallPolicy,
                  transaction,
                  saved.messageId,
                  calls,
                )
              : await runtime.initToolCall(transaction, saved.messageId, calls)
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

export class AIEmployeeChatContextProvider
  extends BaseChatContextProvider
  implements ToolCallPolicy
{
  public constructor(
    private readonly aiEmployeeOptions: AIEmployeeAgentRuntimeOptions,
    private readonly runtime: AIEmployeeCapabilities = new AIEmployeeCapabilities(
      aiEmployeeOptions,
    ),
  ) {
    super({
      llmResolver: {
        resolve: () => resolveAIEmployeeLLM(aiEmployeeOptions),
      },
    });
  }

  public override resolveLLM(request: AgentRequest): Promise<ResolvedAgentLLM> {
    return super.resolveLLM(request);
  }

  public override async getSystemPrompt(
    userMessages: readonly AIMessageInput[],
    _request: AgentRequest,
    _llm: ResolvedAgentLLM,
  ): Promise<string | undefined> {
    const { employee } = this.aiEmployeeOptions;
    const promptMode =
      (employee.chatSettings?.systemPromptMode as
        'default' | 'raw' | 'none' | undefined) ?? 'default';
    if (promptMode === 'none') {
      return '';
    }

    const about = employee.about ?? employee.defaultPrompt ?? '';
    if (promptMode === 'raw') {
      return about;
    }

    const { actor } = this.aiEmployeeOptions.agentContext;
    const userConfig =
      await this.aiEmployeeOptions.repositories.usersAiEmployees.findOne({
        filter: {
          userId: actor.id,
          aiEmployee: employee.username,
        },
      });

    let background = this.aiEmployeeOptions.systemMessage ?? '';
    const additionalSystemPrompts = userMessages.filter(
      (message) => message.role === 'system',
    );
    if (additionalSystemPrompts.length) {
      background = `${background}\n${additionalSystemPrompts
        .map((message) => message.content)
        .join('\n')}`;
    }

    const employeeWithKnowledgeBase = employee as unknown as AIEmployeeType;
    const { knowledgeBaseManager } = this.aiEmployeeOptions;
    const knowledgeBaseEnabled =
      await knowledgeBaseManager.isEnabledKnowledgeBase(
        employeeWithKnowledgeBase,
      );
    const roleNames = actor.roles;
    const hasAccessibleKnowledgeBase = knowledgeBaseEnabled
      ? await knowledgeBaseManager.hasAccessibleKnowledgeBase({
          employee: employeeWithKnowledgeBase,
          roleNames,
        })
      : false;
    const knowledgeBaseAccessDenied =
      knowledgeBaseEnabled && !hasAccessibleKnowledgeBase;
    const knowledgeBaseOnDemand =
      knowledgeBaseEnabled &&
      hasAccessibleKnowledgeBase &&
      normalizeKnowledgeBaseRetrievalStrategy(
        employeeWithKnowledgeBase.knowledgeBase?.retrievalStrategy,
      ) === 'onDemand';

    let knowledgeBase: string | undefined;
    if (
      knowledgeBaseEnabled &&
      hasAccessibleKnowledgeBase &&
      !knowledgeBaseOnDemand &&
      userMessages.length
    ) {
      const lastUserMessage = userMessages
        .filter((message) => message.role === 'user')
        .at(-1);
      if (lastUserMessage) {
        knowledgeBase = await knowledgeBaseManager.retrievePrompt({
          employee: employeeWithKnowledgeBase,
          query: lastUserMessage.content.content as string,
          roleNames,
        });
      }
    }
    const knowledgeBaseBackgroundPrompt = getKnowledgeBaseBackgroundPrompt({
      accessDenied: knowledgeBaseAccessDenied,
      onDemand: knowledgeBaseOnDemand,
      preRetrieved: Boolean(knowledgeBase),
    });
    if (knowledgeBaseBackgroundPrompt) {
      background = `${background}\n${knowledgeBaseBackgroundPrompt}`;
    }

    const availableSkills = await this.runtime.getAvailableSkills();
    const availableAIEmployees = await this.runtime.getAvailableAIEmployees();
    const timezone = getCurrentTimezone(
      this.aiEmployeeOptions.execution ?? {},
      this.aiEmployeeOptions.getHeader ?? (() => undefined),
    );
    const systemPrompt = getSystemPrompt({
      aiEmployee: {
        nickname: employee.nickname,
        about,
      },
      task: { background },
      personal: userConfig?.prompt,
      environment: {
        locale: actor.locale || 'en-US',
        currentDateTime: getCurrentDateTimeForPrompt(actor.locale, timezone),
        timezone,
      },
      knowledgeBase,
      availableSkills,
      availableAIEmployees,
      webSearch: this.aiEmployeeOptions.webSearch,
    });

    if (this.aiEmployeeOptions.execution?.important === 'GraphRecursionError') {
      const importantPrompt = `<Important>You have already called tools multiple times and gathered sufficient information.
First, provide a summary based on the existing information. Do not call additional tools.
If information is missing, clearly state it in the summary.</Important>`;
      return `${importantPrompt}\n\n${systemPrompt}`;
    }
    return systemPrompt;
  }

  public override async discoveredTools(
    _request: AgentRequest,
  ): Promise<readonly import('@nocobase/ai-employee').ToolsEntity[]> {
    return (await this.runtime.getAgentTools()).tools;
  }

  public override async activeTools(
    _request: AgentRequest,
  ): Promise<ReadonlySet<string>> {
    const [{ baseToolNames }, activatedSkillToolNames] = await Promise.all([
      this.runtime.getAgentTools(),
      this.runtime.getActivatedSkillToolNames(),
    ]);
    return new Set([...baseToolNames, ...activatedSkillToolNames]);
  }

  public override getExecutionConfig(
    _request: AgentRequest,
    llm: ResolvedAgentLLM,
  ): Promise<Record<string, unknown>> {
    const collector = (llm as Partial<AIEmployeeResolvedAgentLLM>)[
      responseMetadataCollector
    ];
    return Promise.resolve(collector ? { callbacks: [collector] } : {});
  }

  public override shouldInterruptToolCall(
    tool?: import('@nocobase/ai-employee').ToolsEntity,
  ): boolean {
    return this.runtime.shouldInterruptToolCall(tool);
  }

  public override getToolsMap(
    _request?: AgentRequest,
  ): Promise<ReadonlyMap<string, import('@nocobase/ai-employee').ToolsEntity>> {
    return this.runtime.getToolsMap();
  }

  public async isAutoCall(
    tool: import('@nocobase/ai-employee').ToolsEntity | undefined,
    args: unknown,
  ): Promise<boolean> {
    if (tool?.definition.name !== EXECUTE_FRONTEND_TOOL_NAME) {
      return this.runtime.isAutoCall(tool);
    }
    const frontendTools = await listCurrentFrontendTools(
      this.aiEmployeeOptions.repositories,
      {
        ...(this.aiEmployeeOptions.execution ?? {}),
        sessionId: this.aiEmployeeOptions.sessionId,
      },
    );
    return shouldAutoExecuteFrontendTool(frontendTools, args);
  }
}

export function createAIEmployeeChatContextProvider(
  options: AIEmployeeAgentRuntimeOptions,
  state = createState(options),
): AIEmployeeChatContextProvider {
  return new AIEmployeeChatContextProvider(options, state.runtime);
}

export async function createAIEmployeeAgentProviders(
  options: AIEmployeeAgentRuntimeOptions,
  overrides?: AgentProviderOverrides,
): Promise<AIEmployeeAgentProvidersResult> {
  const state = createState(options);
  const chatContext = createAIEmployeeChatContextProvider(options, state);
  const conversation = createAIEmployeeConversationProvider(
    options,
    state,
    chatContext,
  );
  const tools = createAIEmployeeToolProvider(options, state);
  const providers = createAgentProviders({
    conversation,
    chatContext,
    chatMessageConverters: new AIEmployeeChatMessageConverters(options),
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

function getCurrentTimezone(
  execution: NonNullable<AIEmployeeAgentRuntimeOptions['execution']>,
  getHeader: (name: string) => string | undefined,
): string | undefined {
  return execution.timezone || getHeader('x-timezone') || undefined;
}

function getCurrentDateTimeForPrompt(
  locale: string | undefined,
  timezone?: string,
): string {
  const now = new Date();
  const normalizedLocale = locale || 'en-US';

  try {
    const formatter = new Intl.DateTimeFormat(normalizedLocale, {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return `${formatter.format(now)}${timezone ? ` (${timezone})` : ''}`;
  } catch {
    return `${now.toISOString()}${timezone ? ` (${timezone})` : ''}`;
  }
}
