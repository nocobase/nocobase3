import type {
  AgentProviders,
  AgentRequest,
  AgentContextProvider,
  CurrentConversation,
  DiscoveredTools,
  ResolvedAgentLLM,
} from '../../types.js';
import { DefaultChatMessageConverters } from '../../message/converters.js';
import { NativeCollectionSaver } from '../../checkpoint/index.js';
import type {
  AIEmployee as AIEmployeeType,
  AIMessageInput,
  LLMProviderManager,
  SkillsEntity,
  SkillsManager,
  ToolsEntity,
  ToolsFilter,
  ToolsManager,
} from '@nocobase/ai-employee';
import { listSystemTools, SYSTEM_TOOLS } from '@nocobase/ai-employee';
import _ from 'lodash';
import {
  createConversationProvider,
  createAgentProviders,
} from '../../providers.js';
import type { AIEmployeeContextOptions } from './options.js';
import type { AIEmployeeSkillSettings } from './options.js';
import type { AppAgentContext } from '../../context.js';
import type { ConversationExecution } from '../../contracts.js';
import type { Actor, Translate } from '../../../types.js';
import type { BuiltInManager } from '../../../manager/built-in-manager.js';
import type { KnowledgeBaseManager } from '../../../manager/knowledge-base-manager.js';
import type {
  AIConversationRepository,
  AIToolMessageRepository,
  UserAIEmployeeRepository,
} from '../../../repository/index.js';
import type { AIEmployeeRepository } from '@nocobase/ai-employee';
import { getSystemPrompt } from './prompts.js';
import {
  getKnowledgeBaseBackgroundPrompt,
  normalizeKnowledgeBaseRetrievalStrategy,
} from '../../../manager/knowledge-base-manager.js';
import {
  listAccessibleAIEmployees,
  serializeEmployeeSummary,
} from '../../../manager/sub-agents/shared.js';
import {
  EXECUTE_FRONTEND_TOOL_NAME,
  LOAD_FRONTEND_TOOL_NAME,
} from './common-frontend-tools.js';
import {
  listCurrentFrontendTools,
  prepareToolsForFrontendConversation,
} from './frontend-tools.js';

export interface AIEmployeeAgentContextProviderOptions {
  readonly employee: AIEmployeeType;
  readonly sessionId: string;
  readonly currentConversation: CurrentConversation;
  readonly actor: Actor;
  readonly translate?: Translate;
  readonly toolRuntimeContext: AppAgentContext;
  readonly llmProviderManager: LLMProviderManager;
  readonly toolsManager: ToolsManager;
  readonly skillsManager: SkillsManager;
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

export class AIEmployeeAgentContextProvider implements AgentContextProvider {
  private readonly employee: AIEmployeeType;
  private readonly sessionId: string;
  private readonly conversation: CurrentConversation;
  private readonly actor: Actor;
  private readonly translate?: Translate;
  private readonly toolRuntimeContext: AppAgentContext;
  private readonly llmProviderManager: LLMProviderManager;
  private readonly toolsManager: ToolsManager;
  private readonly skillsManager: SkillsManager;
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

  public constructor(options: AIEmployeeAgentContextProviderOptions) {
    this.employee = options.employee;
    this.sessionId = options.sessionId;
    this.conversation = options.currentConversation;
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

  public currentConversation(): CurrentConversation {
    return this.conversation;
  }

  public async resolveLLM(request: AgentRequest): Promise<ResolvedAgentLLM> {
    if (!request.model) throw new Error('AI employee model is required');
    const resolved = await this.llmProviderManager.getLLMService(request.model);
    return {
      providerName: resolved.service.provider,
      llmService: resolved.service.name,
      model: resolved.model,
      provider: resolved.provider,
    };
  }

  public async getSystemPrompt(
    userMessages: readonly AIMessageInput[],
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

  public async discoveredTools(): Promise<DiscoveredTools> {
    const { tools, baseToolNames } = await this.getAgentTools();
    return {
      tools,
      activeTools: async () => {
        const activeToolNames = new Set([
          ...baseToolNames,
          ...(await this.getActivatedSkillToolNames()),
        ]);
        return new Set([...activeToolNames].filter((name) => tools.has(name)));
      },
    };
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

  private async listToolMap(): Promise<Map<string, ToolsEntity>> {
    const tools = await this.listTools({ sessionId: this.sessionId });
    return new Map(tools.map((tool) => [tool.definition.name, tool]));
  }

  private resolveToolAuto(tool: ToolsEntity): boolean {
    const fallback = tool.defaultPermission === 'ALLOW';
    if (tool.scope !== 'CUSTOM') return fallback;
    const preset = this.employee.skillSettings?.tools?.find(
      (setting: { name: string }) => setting.name === tool.definition.name,
    );
    return preset ? preset.autoCall === true : fallback;
  }

  private resolveTool(tool: ToolsEntity): ToolsEntity {
    return {
      ...tool,
      definition: { ...tool.definition },
      auto: this.resolveToolAuto(tool),
    };
  }

  private async getAIEmployeeTools(
    discoveredToolMap?: ReadonlyMap<string, ToolsEntity>,
  ): Promise<ToolsEntity[]> {
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
    const toolMap = discoveredToolMap ?? (await this.listToolMap());
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

  private async getAvailableSkillsForTools(
    tools: readonly ToolsEntity[],
  ): Promise<SkillsEntity[]> {
    if (this.chatSettings.enableSkills === false) return [];
    const getSkill = tools.find(
      (tool) => tool.definition.name === SYSTEM_TOOLS.GET_SKILL,
    );
    if (!getSkill) return [];
    const general = await this.skillsManager.listSkills({ scope: 'GENERAL' });
    const names = this.employee.skillSettings?.skills ?? [];
    const specified = names.length
      ? await this.skillsManager.getSkills(names)
      : [];
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

  public async getAvailableSkills(): Promise<SkillsEntity[]> {
    return this.getAvailableSkillsForTools(await this.getAIEmployeeTools());
  }

  public async getAgentTools(): Promise<{
    tools: ReadonlyMap<string, ToolsEntity>;
    baseToolNames: Set<string>;
  }> {
    if (this.chatSettings.enableTools === false) {
      return { tools: new Map(), baseToolNames: new Set() };
    }
    const discoveredToolMap = await this.listToolMap();
    const baseTools = await this.getAIEmployeeTools(discoveredToolMap);
    const toolMap = new Map(discoveredToolMap);
    for (const tool of baseTools) toolMap.set(tool.definition.name, tool);
    const skillToolNames = new Set(
      (await this.getAvailableSkillsForTools(baseTools)).flatMap(
        (skill) => skill.tools ?? [],
      ),
    );
    const baseToolNames = new Set(
      baseTools
        .map((tool) => tool.definition.name)
        .filter(
          (name) =>
            name === SYSTEM_TOOLS.GET_SKILL || !skillToolNames.has(name),
        ),
    );
    return {
      tools: new Map(
        [...toolMap].map(([name, tool]) => [name, this.resolveTool(tool)]),
      ),
      baseToolNames,
    };
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
      normalized
        .filter((skill): skill is SkillsEntity => Boolean(skill))
        .map((skill) => [skill.name, skill]),
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
}

export function createAIEmployeeAgentContextProvider(
  options: AIEmployeeContextOptions,
): AIEmployeeAgentContextProvider {
  return new AIEmployeeAgentContextProvider({
    employee: options.employee as AIEmployeeType,
    sessionId: options.sessionId,
    currentConversation: {
      sessionId: options.sessionId,
      from: options.from ?? 'main-agent',
      username: String(options.employee.username ?? ''),
      metadata: { kind: 'ai-employee' },
    },
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
  options: AIEmployeeContextOptions,
): Promise<AgentProviders> {
  const context = createAIEmployeeAgentContextProvider(options);
  const conversation = createConversationProvider(options);
  return createAgentProviders({
    conversation,
    context,
    logger: options.agentContext.logger,
    converters: new DefaultChatMessageConverters({
      employee: options.employee,
      skillSettings: options.skillSettings,
      logger: options.agentContext.logger,
      actorId: options.agentContext.actor?.id ?? 0,
      collectionRepository: options.collectionRepository,
      workContextHandler: options.workContextHandler,
      fileStorage: options.fileStorage,
      documentLoaders: options.documentLoaders,
      caching: options.caching,
      getHeader: options.getHeader,
    }),
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
  execution: ConversationExecution,
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
