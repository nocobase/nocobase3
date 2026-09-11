import { randomUUID } from 'node:crypto';
import {
  createServiceToken,
  type ServiceResolver,
  type ServiceToken,
} from '@nocobase/service-provider';
import {
  databaseManagerToken,
  type DatabaseManager,
  type DatabaseConnection,
} from '@nocobase/db';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { loggingToken } from '@nocobase/app-server/logging';
import { cachingToken } from '@nocobase/app-server/caching';
import type { AIManager, ToolsEntity } from '@nocobase/ai-employee';
import type { Caching } from '@nocobase/caching';
import type { Logger } from '@nocobase/logging';
import type { IdGeneratorService } from '@nocobase/snowflake';
import { createAgentService, type AgentService } from './agent-service.js';
import { createAIEmployeeAgentContextProvider } from '../context/ai-employee/context.js';
import type { AIEmployeeSkillSettings } from '../context/ai-employee/options.js';
import { FixedAgentContextProvider } from '../context/fixed/context.js';
import { createAgentProviders } from '../providers.js';
import { DefaultChatMessageConverters } from '../message/converters.js';
import { NativeCollectionSaver } from '../checkpoint/index.js';
import type { ConversationPersistence } from '../contracts/persistence.js';
import { DatabaseConversationPersistence } from '../conversation/persistence/database.js';
import { ConversationProvider } from '../conversation/conversation-provider.js';
import { createAgentContext, type AppAgentContext } from '../context.js';
import type { Actor, ModelRef, Translate } from '../../types.js';
import {
  repositoryFactoryToken,
  type RepositoryFactory,
} from '../../factory/repository-factory.js';
import {
  managerFactoryToken,
  type ManagerFactory,
} from '../../factory/manager-factory.js';
import { aiManagerToken } from '../../provider/ai-employee.js';

export const agentServiceFactoryToken: ServiceToken<AgentServiceFactory> =
  createServiceToken<AgentServiceFactory>(
    '@nocobase/app-plugin-ai-employee/agent-service-factory',
  );

export interface CreateEmployeeOptions {
  readonly username: string;
  readonly sessionId?: string;
  readonly systemPrompt?: string;
  readonly actor?: Actor;
  readonly frontendTools?: readonly unknown[];
  readonly from?: 'main-agent' | 'sub-agent';
  readonly translate?: Translate;
  readonly getHeader?: (name: string) => string | undefined;
  readonly skillSettings?: AIEmployeeSkillSettings;
  readonly webSearch?: boolean;
  readonly tools?: { name: string }[];
}

export interface CreateAgentOptions {
  readonly sessionId?: string;
  readonly username?: string;
  readonly model?: ModelRef;
  readonly systemPrompt?: string;
  readonly tools?: readonly string[];
  readonly skills?: readonly string[];
  readonly persistence?: ConversationPersistence;
}

export class AgentServiceFactory {
  private readonly container: ServiceResolver;
  private readonly aiManager: AIManager;
  private readonly repositoryFactory: RepositoryFactory;
  private readonly managerFactory: ManagerFactory;
  private readonly databaseManager: DatabaseManager;
  private readonly databaseConnection: DatabaseConnection;
  private readonly loggerService: Logger;
  private readonly cachingService: Caching;
  private readonly idGenerator: IdGeneratorService;

  public constructor(
    container: ServiceResolver | { container: ServiceResolver },
  ) {
    this.container = 'container' in container ? container.container : container;
    this.aiManager = this.container.resolve(aiManagerToken);
    this.repositoryFactory = this.container.resolve(repositoryFactoryToken);
    this.managerFactory = this.container.resolve(managerFactoryToken);
    this.databaseManager = this.container.resolve(databaseManagerToken);
    this.databaseConnection = this.databaseManager.connection();
    this.loggerService = this.container
      .resolve(loggingToken)
      .getLogger('ai-employee');
    this.cachingService = this.container.resolve(cachingToken);
    this.idGenerator = this.container.resolve(idGeneratorToken);
  }

  public async createAIEmployee(
    options: CreateEmployeeOptions,
  ): Promise<AgentService> {
    const repositories = this.repositoryFactory;
    const managers = this.managerFactory;
    const sessionId = options.sessionId ?? randomUUID();
    const actor = options.actor ?? { id: 0, roles: [], isRoot: true };
    const agentContext = this.createContext(
      actor,
      options.translate,
      options.getHeader,
    );
    const employee = await managers.aiEmployeesManager.getEmployee(
      options.username,
    );
    if (!employee)
      throw new Error(`AI employee "${options.username}" not found`);
    const contextOptions = {
      employee,
      sessionId,
      currentConversation: {
        sessionId,
        from: options.from ?? 'main-agent',
        username: String(employee.username ?? ''),
        metadata: { kind: 'ai-employee' },
      },
      actor,
      translate: options.translate,
      toolRuntimeContext: agentContext,
      llmProviderManager: this.aiManager.llmProviderManager,
      toolsManager: this.aiManager.toolsManager,
      skillsManager: this.aiManager.skillsManager,
      builtInManager: managers.builtInManager,
      knowledgeBaseManager: managers.knowledgeBaseManager,
      conversations: repositories.aiConversations,
      employees: repositories.aiEmployees,
      toolMessages: repositories.aiToolMessages,
      usersAiEmployees: repositories.usersAiEmployees,
      frontendTools: options.frontendTools,
      getHeader: options.getHeader,
      systemMessage: options.systemPrompt,
      skillSettings: options.skillSettings,
      webSearch: options.webSearch,
      tools: options.tools,
    };
    const context = createAIEmployeeAgentContextProvider(contextOptions);
    const persistence = new DatabaseConversationPersistence({
      database: this.databaseConnection,
      snowflake: this.idGenerator,
      conversations: repositories.aiConversations,
      messages: repositories.aiMessages,
      toolMessages: repositories.aiToolMessages,
      usageEvents: repositories.aiUsageEvents,
    });
    const conversation = new ConversationProvider({
      sessionId,
      persistence,
      streamCache: managers.llmStreamCachedManager,
      employeesManager: managers.aiEmployeesManager,
      logger: this.loggerService,
    });
    return createAgentService(
      createAgentProviders({
        conversation,
        context,
        logger: this.loggerService,
        converters: new DefaultChatMessageConverters({
          employee: contextOptions.employee,
          skillSettings: contextOptions.skillSettings,
          logger: this.loggerService,
          actorId: actor.id,
          collectionRepository:
            repositories.collectionRepository.bind(repositories),
          workContextHandler: managers.workContextHandler,
          fileStorage: managers.fileStorage,
          documentLoaders: managers.documentLoaders,
          caching: this.cachingService,
          getHeader: options.getHeader,
        }),
        checkpointer:
          options.from === 'sub-agent'
            ? undefined
            : new NativeCollectionSaver({
                checkpoints: repositories.lcCheckpoints,
                blobs: repositories.lcCheckpointBlobs,
                writes: repositories.lcCheckpointWrites,
              }),
      }),
    );
  }

  public async createAgent(
    options: CreateAgentOptions = {},
  ): Promise<AgentService> {
    const repositories = this.repositoryFactory;
    const managers = this.managerFactory;
    const sessionId = options.sessionId ?? randomUUID();
    const persistence =
      options.persistence ??
      new DatabaseConversationPersistence({
        database: this.databaseConnection,
        snowflake: this.idGenerator,
        conversations: repositories.aiConversations,
        messages: repositories.aiMessages,
        toolMessages: repositories.aiToolMessages,
        usageEvents: repositories.aiUsageEvents,
      });
    const model = await this.aiManager.llmProviderManager.resolveModel(
      options.model,
    );
    const resolved =
      await this.aiManager.llmProviderManager.getLLMService(model);
    const configuredToolNames = new Set(options.tools ?? []);
    const tools = new Map<string, ToolsEntity>();
    if (options.tools?.length) {
      const configuredTools = await Promise.all(
        options.tools.map((name) => this.aiManager.toolsManager.getTools(name)),
      );
      for (const tool of configuredTools) {
        if (tool) tools.set(tool.definition.name, tool);
      }
    }
    if (options.skills?.length) {
      const skills = await this.aiManager.skillsManager.getSkills([
        ...options.skills,
      ]);
      for (const skill of skills) {
        for (const name of skill.tools ?? []) configuredToolNames.add(name);
      }
      const skillTools = await Promise.all(
        [...configuredToolNames].map((name) =>
          this.aiManager.toolsManager.getTools(name),
        ),
      );
      for (const tool of skillTools) {
        if (tool) tools.set(tool.definition.name, tool);
      }
    }
    const context = new FixedAgentContextProvider({
      sessionId,
      username: options.username,
      model,
      provider: resolved.provider,
      providerName: resolved.service.provider,
      llmService: resolved.service.name,
      resolveLLM: async (requestModel) => {
        const requestResolved =
          await this.aiManager.llmProviderManager.getLLMService(requestModel);
        return {
          providerName: requestResolved.service.provider,
          llmService: requestResolved.service.name,
          model: requestResolved.model,
          provider: requestResolved.provider,
        };
      },
      systemPrompt: options.systemPrompt,
      tools,
      activeTools: configuredToolNames,
    });
    const conversation = new ConversationProvider({
      sessionId,
      persistence,
      streamCache: managers.llmStreamCachedManager,
      employeesManager: managers.aiEmployeesManager,
      logger: this.loggerService,
    });
    return createAgentService(
      createAgentProviders({
        conversation,
        context,
        logger: this.loggerService,
        converters: undefined,
      }),
    );
  }

  private createContext(
    actor: Actor,
    translate?: Translate,
    getHeader?: (name: string) => string | undefined,
  ): AppAgentContext {
    const managers = this.managerFactory;
    return createAgentContext({
      actor,
      ai: this.aiManager,
      database: this.databaseManager,
      logger: this.loggerService,
      repositories: this.repositoryFactory,
      aiEmployeesManager: managers.aiEmployeesManager,
      aiConversationsManager: managers.aiConversationsManager,
      builtInManager: managers.builtInManager,
      knowledgeBaseManager: managers.knowledgeBaseManager,
      subAgentsDispatcher: managers.subAgentsDispatcher,
      translate,
      getHeader,
    });
  }
}
