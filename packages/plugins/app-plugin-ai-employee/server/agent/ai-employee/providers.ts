import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import type {
  AgentAbortHandle,
  AgentProviders,
  AgentRequest,
  ChatContextProvider,
  ConversationProvider,
  ResolvedAgentLLM,
  ToolCallPolicy,
} from '../types.js';
import { DefaultChatMessageConverters } from '../chat-message-converters.js';
import { NativeCollectionSaver } from '../../agent/ai-employee/checkpoints/index.js';
import { createAIChatConversation } from './ai-chat-conversation.js';
import type {
  AIEmployee as AIEmployeeType,
  AIMessageInput,
  LLMProvider,
  SkillsEntity,
  ToolsEntity,
  ToolsFilter,
} from '@nocobase/ai-employee';
import { listSystemTools, SYSTEM_TOOLS } from '@nocobase/ai-employee';
import _ from 'lodash';
import { createAgentProviders } from '../providers.js';
import type { AIEmployeeAgentOptions } from './options.js';
import type { AIEmployeeSkillSettings } from './options.js';
import type { AppAgentContext } from '../context.js';
import type { ConversationExecution } from '../contracts.js';
import type { Actor, ModelRef, Translate } from '../../types.js';
import type { BuiltInManager } from '../../manager/built-in-manager.js';
import type { KnowledgeBaseManager } from '../../manager/knowledge-base-manager.js';
import type {
  AIConversationRepository,
  AIToolMessageRepository,
  UserAIEmployeeRepository,
} from '../../repository/index.js';
import type { AIEmployeeRepository } from '@nocobase/ai-employee';
import { DefaultToolCallHandler } from './tool-call-handler.js';
import { DefaultConversationMessageStore } from './conversation-message-store.js';
import { getSystemPrompt } from './prompts.js';
import {
  getKnowledgeBaseBackgroundPrompt,
  normalizeKnowledgeBaseRetrievalStrategy,
} from '../../manager/knowledge-base-manager.js';
import {
  listAccessibleAIEmployees,
  serializeEmployeeSummary,
} from '../../manager/sub-agents/shared.js';
import {
  EXECUTE_FRONTEND_TOOL_NAME,
  LOAD_FRONTEND_TOOL_NAME,
} from './common/frontend-tools.js';
import {
  listCurrentFrontendTools,
  prepareToolsForFrontendConversation,
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

export function createConversationProvider(
  options: AIEmployeeAgentOptions,
  toolCallPolicy: ToolCallPolicy,
): ConversationProvider {
  const database = options.database;
  const sessionId = options.sessionId;
  const toolCalls = new DefaultToolCallHandler(
    sessionId,
    database,
    options.aiMessages,
    options.aiToolMessages,
    options.snowflake,
  );
  const chatConversation = createAIChatConversation({
    messages: options.aiMessages,
    database,
    snowflake: options.snowflake,
    sessionId,
  });
  const from = options.from ?? 'main-agent';
  const username = String(options.employee.username ?? '');
  const cache = options.llmStreamCachedManager.getCached(sessionId);
  const messageStore = new DefaultConversationMessageStore({
    sessionId,
    conversation: chatConversation,
    conversations: options.aiConversations,
    toolMessages: options.aiToolMessages,
    snowflake: options.snowflake,
    toolCallPolicy,
  });
  const conversation: ConversationProvider = {
    identity: { sessionId, from, username, metadata: { kind: 'ai-employee' } },
    toolCalls,
    messages: messageStore,
    beforeExecution: async (mode) => {
      await options.aiConversations.update({
        values: { llmActiveState: mode },
        filter: { sessionId },
      });
    },
    afterExecution: async (mode, result) => {
      await options.aiConversations.update({
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
    streamCache: cache,
    updateAssistantResponseMetadata: async (messageId, metadata) => {
      const message = await options.aiMessages.findOne({
        filter: { sessionId, messageId },
      });
      if (message) {
        await options.aiMessages.update({
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
  };
  return conversation;
}

export interface AIEmployeeChatContextProviderOptions {
  readonly employee: AIEmployeeType;
  readonly sessionId: string;
  readonly model?: ModelRef;
  readonly actor: Actor;
  readonly translate?: Translate;
  readonly toolRuntimeContext: AppAgentContext;
  readonly llmProviderManager: AppAgentContext['ai']['llmProviderManager'];
  readonly toolsManager: AppAgentContext['ai']['toolsManager'];
  readonly skillsManager: AppAgentContext['ai']['skillsManager'];
  readonly builtInManager: BuiltInManager;
  readonly knowledgeBaseManager: KnowledgeBaseManager;
  readonly conversations: AIConversationRepository;
  readonly employees: AIEmployeeRepository;
  readonly toolMessages: AIToolMessageRepository;
  readonly usersAiEmployees: UserAIEmployeeRepository;
  readonly execution?: ConversationExecution;
  readonly getHeader?: (name: string) => string | undefined;
  readonly systemMessage?: string;
  readonly skillSettings?: AIEmployeeSkillSettings;
  readonly webSearch?: boolean;
  readonly tools?: { name: string }[];
}

export class AIEmployeeChatContextProvider implements ChatContextProvider {
  private readonly employee: AIEmployeeType;
  private readonly sessionId: string;
  private readonly model?: ModelRef;
  private readonly actor: Actor;
  private readonly translate?: Translate;
  private readonly toolRuntimeContext: AppAgentContext;
  private readonly llmProviderManager: AppAgentContext['ai']['llmProviderManager'];
  private readonly toolsManager: AppAgentContext['ai']['toolsManager'];
  private readonly skillsManager: AppAgentContext['ai']['skillsManager'];
  private readonly builtInManager: BuiltInManager;
  private readonly knowledgeBaseManager: KnowledgeBaseManager;
  private readonly conversations: AIConversationRepository;
  private readonly employees: AIEmployeeRepository;
  private readonly toolMessages: AIToolMessageRepository;
  private readonly usersAiEmployees: UserAIEmployeeRepository;
  private readonly execution: ConversationExecution;
  private readonly getHeader: (name: string) => string | undefined;
  private readonly systemMessage: string;
  private readonly skillSettings?: AIEmployeeSkillSettings;
  private readonly webSearch: boolean;
  private readonly tools: { name: string }[];

  public constructor(options: AIEmployeeChatContextProviderOptions) {
    this.employee = options.employee;
    this.sessionId = options.sessionId;
    this.model = options.model;
    this.actor = options.actor;
    this.translate = options.translate;
    this.toolRuntimeContext = options.toolRuntimeContext;
    this.llmProviderManager = options.llmProviderManager;
    this.toolsManager = options.toolsManager;
    this.skillsManager = options.skillsManager;
    this.builtInManager = options.builtInManager;
    this.knowledgeBaseManager = options.knowledgeBaseManager;
    this.conversations = options.conversations;
    this.employees = options.employees;
    this.toolMessages = options.toolMessages;
    this.usersAiEmployees = options.usersAiEmployees;
    this.execution = options.execution ?? {};
    this.getHeader = options.getHeader ?? (() => undefined);
    this.systemMessage = options.systemMessage ?? '';
    this.skillSettings = options.skillSettings;
    this.webSearch = options.webSearch ?? false;
    this.tools = options.tools ?? [];
    this.builtInManager.setupBuiltInInfo({
      employee: this.employee,
      translate: this.translate,
    });
  }

  public async resolveLLM(_request: AgentRequest): Promise<ResolvedAgentLLM> {
    if (!this.model) throw new Error('AI employee model is required');
    const resolved = await this.llmProviderManager.getLLMService(this.model);
    const metadata = new ExecutionResponseMetadata();
    const collector = new ResponseMetadataCollector(
      resolved.provider,
      metadata,
    );
    return {
      providerName: resolved.service.provider,
      llmService: resolved.service.name,
      model: resolved.model,
      provider: resolved.provider,
      takeResponseMetadata: (id) => metadata.take(id),
      dispose: () => metadata.dispose(),
      [responseMetadataCollector]: collector,
    } as AIEmployeeResolvedAgentLLM;
  }

  public async getSystemPrompt(
    userMessages: readonly AIMessageInput[],
    _request: AgentRequest,
    _llm: ResolvedAgentLLM,
  ): Promise<string | undefined> {
    const employee = this.employee;
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

    const actor = this.actor;
    const userConfig = await this.usersAiEmployees.findOne({
      filter: {
        userId: actor.id,
        aiEmployee: employee.username,
      },
    });

    let background = this.systemMessage ?? '';
    const additionalSystemPrompts = userMessages.filter(
      (message) => message.role === 'system',
    );
    if (additionalSystemPrompts.length) {
      background = `${background}\n${additionalSystemPrompts
        .map((message) => message.content)
        .join('\n')}`;
    }

    const employeeWithKnowledgeBase = employee as unknown as AIEmployeeType;
    const knowledgeBaseManager = this.knowledgeBaseManager;
    const knowledgeBaseEnabled =
      await knowledgeBaseManager.isEnabledKnowledgeBase(
        employeeWithKnowledgeBase,
      );
    const roleNames = [...actor.roles];
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

    const availableSkills = await this.getAvailableSkills();
    const availableAIEmployees = await this.getAvailableAIEmployees();
    const timezone = getCurrentTimezone(
      this.execution ?? {},
      this.getHeader ?? (() => undefined),
    );
    const systemPrompt = getSystemPrompt({
      aiEmployee: {
        nickname: employee.nickname ?? employee.username,
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
      webSearch: this.webSearch,
    });

    if (this.execution?.important === 'GraphRecursionError') {
      const importantPrompt = `<Important>You have already called tools multiple times and gathered sufficient information.
First, provide a summary based on the existing information. Do not call additional tools.
If information is missing, clearly state it in the summary.</Important>`;
      return `${importantPrompt}\n\n${systemPrompt}`;
    }
    return systemPrompt;
  }

  public async discoveredTools(
    _request: AgentRequest,
  ): Promise<readonly import('@nocobase/ai-employee').ToolsEntity[]> {
    return (await this.getAgentTools()).tools;
  }

  public async activeTools(
    _request: AgentRequest,
  ): Promise<ReadonlySet<string>> {
    const [{ baseToolNames }, activatedSkillToolNames] = await Promise.all([
      this.getAgentTools(),
      this.getActivatedSkillToolNames(),
    ]);
    return new Set([...baseToolNames, ...activatedSkillToolNames]);
  }

  public getExecutionConfig(
    _request: AgentRequest,
    llm: ResolvedAgentLLM,
  ): Promise<Record<string, unknown>> {
    const collector = (llm as Partial<AIEmployeeResolvedAgentLLM>)[
      responseMetadataCollector
    ];
    return Promise.resolve(collector ? { callbacks: [collector] } : {});
  }

  private get chatSettings(): {
    enableSkills?: boolean;
    enableTools?: boolean;
  } {
    return (this.employee.chatSettings ?? {}) as {
      enableSkills?: boolean;
      enableTools?: boolean;
    };
  }

  private async getKnowledgeBaseRetrieveTool(): Promise<
    ToolsEntity | undefined
  > {
    const employee = this.employee;
    if (!(await this.knowledgeBaseManager.isEnabledKnowledgeBase(employee)))
      return undefined;
    if (
      !(await this.knowledgeBaseManager.hasAccessibleKnowledgeBase({
        employee,
        roleNames: [...this.actor.roles],
      }))
    )
      return undefined;
    return this.toolsManager.getTools(SYSTEM_TOOLS.KNOWLEDGE_BASE, {
      ctx: this.toolRuntimeContext,
    });
  }

  private listTools(filter?: ToolsFilter): Promise<ToolsEntity[]> {
    return this.toolsManager.listTools({
      ...filter,
      ctx: this.toolRuntimeContext,
    });
  }

  private async getAIEmployeeTools(): Promise<ToolsEntity[]> {
    if (this.chatSettings.enableTools === false) return [];
    const currentFrontendTools = await listCurrentFrontendTools(
      this.conversations,
      {
        ...(this.execution ?? {}),
        sessionId: this.sessionId,
      },
    );
    const tools = await this.listTools({ scope: 'GENERAL' });
    const getSkill = await this.toolsManager.getTools(SYSTEM_TOOLS.GET_SKILL, {
      ctx: this.toolRuntimeContext,
    });
    if (getSkill) tools.push(getSkill);
    if (this.webSearch === true) {
      const webSearch = await this.toolsManager.getTools(
        SYSTEM_TOOLS.WEB_SEARCH,
        {
          ctx: this.toolRuntimeContext,
        },
      );
      if (webSearch) tools.push(webSearch);
    }
    const generalNames = new Set(tools.map((tool) => tool.definition.name));
    const toolMap = await this.getToolsMap();
    const configured = [
      ...(this.employee.skillSettings?.tools ?? []),
      ...(this.tools ?? []),
    ];
    if (await this.getKnowledgeBaseRetrieveTool())
      configured.push({ name: SYSTEM_TOOLS.KNOWLEDGE_BASE });
    for (const setting of configured) {
      if (!generalNames.has(setting.name)) {
        const tool = toolMap.get(setting.name);
        if (tool) tools.push(tool);
      }
    }
    const systemTools = [
      ...listSystemTools(),
      LOAD_FRONTEND_TOOL_NAME,
      EXECUTE_FRONTEND_TOOL_NAME,
    ];
    const settings = this.skillSettings;
    if (!settings)
      return prepareToolsForFrontendConversation(tools, currentFrontendTools);
    const filter = settings.tools;
    if (!settings.toolsVersion) {
      const names = filter ?? [];
      return prepareToolsForFrontendConversation(
        tools.filter(
          (tool) =>
            names.length === 0 ||
            systemTools.includes(tool.definition.name) ||
            names.includes(tool.definition.name),
        ),
        currentFrontendTools,
      );
    }
    if (Array.isArray(filter)) {
      return prepareToolsForFrontendConversation(
        tools.filter(
          (tool) =>
            systemTools.includes(tool.definition.name) ||
            filter.includes(tool.definition.name),
        ),
        currentFrontendTools,
      );
    }
    return prepareToolsForFrontendConversation(tools, currentFrontendTools);
  }

  public async getAvailableSkills(): Promise<SkillsEntity[]> {
    if (this.chatSettings.enableSkills === false) return [];
    const skillsManager = this.skillsManager;
    const getSkill = (await this.getAIEmployeeTools()).find(
      (tool) => tool.definition.name === SYSTEM_TOOLS.GET_SKILL,
    );
    if (!getSkill) return [];
    const general = await skillsManager.listSkills({ scope: 'GENERAL' });
    const names = this.employee.skillSettings?.skills ?? [];
    const specified = names.length ? await skillsManager.getSkills(names) : [];
    const merged = _.uniqBy([...(specified || []), ...(general || [])], 'name');
    const settings = this.skillSettings;
    if (!settings) return merged;
    const filter = settings.skills ?? [];
    if (!settings.skillsVersion) {
      return merged.filter(
        (skill) => filter.length === 0 || filter.includes(skill.name),
      );
    }
    return Array.isArray(filter)
      ? merged.filter((skill) => filter.includes(skill.name))
      : merged;
  }

  public async getAgentTools(): Promise<{
    tools: ToolsEntity[];
    baseToolNames: Set<string>;
  }> {
    if (this.chatSettings.enableTools === false)
      return { tools: [], baseToolNames: new Set() };
    const baseTools = await this.getAIEmployeeTools();
    const toolMap = new Map(await this.getToolsMap());
    for (const tool of baseTools) toolMap.set(tool.definition.name, tool);
    const skillToolNames = new Set(
      (await this.getAvailableSkills()).flatMap((skill) => skill.tools ?? []),
    );
    const baseToolNames = new Set(
      baseTools
        .map((tool) => tool.definition.name)
        .filter(
          (name) =>
            name === SYSTEM_TOOLS.GET_SKILL || !skillToolNames.has(name),
        ),
    );
    return { tools: Array.from(toolMap.values()), baseToolNames };
  }

  private async getLoadedSkillNames(): Promise<string[]> {
    const list = await this.toolMessages.find({
      filter: {
        sessionId: this.sessionId,
        toolName: SYSTEM_TOOLS.GET_SKILL,
        status: 'success',
      },
      sort: ['id'],
    });
    const names = new Set<string>();
    for (const item of list) {
      let content: unknown = item.content;
      if (typeof content === 'string') {
        try {
          content = JSON.parse(content);
        } catch {
          continue;
        }
      }
      if (content && typeof content === 'object') {
        const name = (content as Record<string, unknown>).skillName;
        if (typeof name === 'string') names.add(name);
      }
    }
    return [...names];
  }

  public async getActivatedSkillToolNames(): Promise<Set<string>> {
    const names = await this.getLoadedSkillNames();
    if (!names.length) return new Set();
    const loaded = await this.skillsManager.getSkills(names);
    const normalized = Array.isArray(loaded) ? loaded : [loaded];
    const skills = new Map(
      [...(await this.getAvailableSkills()), ...normalized.filter(Boolean)].map(
        (skill) => [skill.name, skill],
      ),
    );
    return new Set(names.flatMap((name) => skills.get(name)?.tools ?? []));
  }

  public async getAvailableAIEmployees(): Promise<
    ReturnType<typeof serializeEmployeeSummary>[]
  > {
    const configured =
      this.employee.skillSettings?.tools?.map(
        ({ name }: { name: string }) => name,
      ) ?? [];
    if (!configured.includes('dispatch-sub-agent-task')) return [];
    return (
      await listAccessibleAIEmployees({
        roleNames: [...this.actor.roles],
        employees: this.employees,
      })
    )
      .map((employee) =>
        serializeEmployeeSummary({
          employee,
          builtInManager: this.builtInManager,
          translate: this.translate,
        }),
      )
      .filter((employee) => employee.username !== this.employee.username);
  }

  public async getToolsMap(): Promise<ReadonlyMap<string, ToolsEntity>> {
    const tools = await this.listTools({
      sessionId: this.sessionId,
    });
    return new Map(tools.map((tool) => [tool.definition.name, tool]));
  }

  public shouldInterruptToolCall(tool?: ToolsEntity): boolean {
    return tool?.execution === 'frontend' || !this.isAutoCall(tool, undefined);
  }

  public async isAutoCall(
    tool: ToolsEntity | undefined,
    args: unknown,
  ): Promise<boolean> {
    if (tool?.definition.name === EXECUTE_FRONTEND_TOOL_NAME) {
      const frontendTools = await listCurrentFrontendTools(this.conversations, {
        ...(this.execution ?? {}),
        sessionId: this.sessionId,
      });
      return shouldAutoExecuteFrontendTool(frontendTools, args);
    }
    if (!tool) return false;
    const fallback = tool.defaultPermission === 'ALLOW';
    if (tool.scope !== 'CUSTOM') return fallback;
    const preset = this.employee.skillSettings?.tools?.find(
      (setting: { name: string }) => setting.name === tool.definition.name,
    );
    return preset ? preset.autoCall === true : fallback;
  }
}

export function createAIEmployeeChatContextProvider(
  options: AIEmployeeAgentOptions,
): AIEmployeeChatContextProvider {
  return new AIEmployeeChatContextProvider({
    employee: options.employee as AIEmployeeType,
    sessionId: options.sessionId,
    model: options.model,
    actor: options.agentContext.actor,
    translate: options.agentContext.translate,
    toolRuntimeContext: options.agentContext,
    llmProviderManager: options.agentContext.ai.llmProviderManager,
    toolsManager: options.agentContext.ai.toolsManager,
    skillsManager: options.agentContext.ai.skillsManager,
    builtInManager: options.builtInManager,
    knowledgeBaseManager: options.knowledgeBaseManager,
    conversations: options.aiConversations,
    employees: options.aiEmployees,
    toolMessages: options.aiToolMessages,
    usersAiEmployees: options.usersAiEmployees,
    execution: options.execution,
    getHeader: options.getHeader,
    systemMessage: options.systemMessage,
    skillSettings: options.skillSettings,
    webSearch: options.webSearch,
    tools: options.tools,
  });
}

export async function createAIEmployeeAgentProviders(
  options: AIEmployeeAgentOptions,
): Promise<AgentProviders> {
  const chatContext = createAIEmployeeChatContextProvider(options);
  const conversation = createConversationProvider(options, chatContext);
  return createAgentProviders({
    conversation,
    chatContext,
    logger: options.agentContext.logger,
    chatMessageConverters: new DefaultChatMessageConverters(options),
    checkpointer:
      options.from === 'sub-agent'
        ? undefined
        : new NativeCollectionSaver({
            checkpoints: options.lcCheckpoints,
            blobs: options.lcCheckpointBlobs,
            writes: options.lcCheckpointWrites,
          }),
  });
}

function getCurrentTimezone(
  execution: NonNullable<AIEmployeeAgentOptions['execution']>,
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
