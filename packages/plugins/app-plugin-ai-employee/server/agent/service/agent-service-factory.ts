import { randomUUID } from 'node:crypto';
import {
  createServiceToken,
  type ServiceResolver,
  type ServiceToken,
} from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { loggingToken } from '@nocobase/app-server/logging';
import { cachingToken } from '@nocobase/app-server/caching';
import type { AIManager } from '@nocobase/ai-employee';
import { createAgentService, type AgentService } from './agent-service.js';
import { createAIEmployeeAgentContextProvider } from '../context/ai-employee/context.js';
import type {
  AIEmployeeContextOptions,
  AIEmployeeSkillSettings,
} from '../context/ai-employee/options.js';
import { FixedAgentContextProvider } from '../context/fixed/context.js';
import { createAgentProviders } from '../providers.js';
import type { AgentProviders, AgentContextProvider } from '../types.js';
import { DefaultChatMessageConverters } from '../message/converters.js';
import { NativeCollectionSaver } from '../checkpoint/index.js';
import type { ConversationPersistence } from '../contracts/persistence.js';
import { DatabaseConversationPersistence } from '../conversation/persistence/database.js';
import { ConversationProvider } from '../conversation/conversation-provider.js';
import { createAgentContext, type AppAgentContext } from '../context.js';
import type { Actor, ModelRef, Translate } from '../../types.js';
import type { ConversationExecution } from '../contracts.js';
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
  readonly execution?: ConversationExecution;
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
  readonly persistence?: ConversationPersistence;
  readonly context?: AgentContextProvider;
  readonly providers?: AgentProviders;
}

export class AgentServiceFactory {
  private readonly container: ServiceResolver;

  public constructor(
    container: ServiceResolver | { container: ServiceResolver },
  ) {
    this.container = 'container' in container ? container.container : container;
  }

  public async createAIEmployee(
    options: CreateEmployeeOptions,
  ): Promise<AgentService> {
    const repositories = this.repositories;
    const managers = this.managers;
    const sessionId =
      options.sessionId ?? options.execution?.sessionId ?? randomUUID();
    const actor = options.actor ?? { id: 0, roles: [], isRoot: true };
    const execution = options.execution ?? { sessionId };
    const agentContext = this.createContext(
      actor,
      execution,
      options.translate,
      options.getHeader,
    );
    const employee = await managers.aiEmployeesManager.getEmployee(
      options.username,
    );
    if (!employee)
      throw new Error(`AI employee "${options.username}" not found`);
    const contextOptions: AIEmployeeContextOptions = {
      agentContext,
      database: this.database,
      caching: this.container.resolve(cachingToken),
      fileStorage: managers.fileStorage,
      snowflake: this.container.resolve(idGeneratorToken),
      execution,
      getHeader: options.getHeader,
      collectionRepository:
        repositories.collectionRepository.bind(repositories),
      aiConversations: repositories.aiConversations,
      aiEmployees: repositories.aiEmployees,
      aiMessages: repositories.aiMessages,
      aiToolMessages: repositories.aiToolMessages,
      aiUsageEvents: repositories.aiUsageEvents,
      usersAiEmployees: repositories.usersAiEmployees,
      lcCheckpoints: repositories.lcCheckpoints,
      lcCheckpointBlobs: repositories.lcCheckpointBlobs,
      lcCheckpointWrites: repositories.lcCheckpointWrites,
      aiEmployeesManager: managers.aiEmployeesManager,
      builtInManager: managers.builtInManager,
      llmStreamCachedManager: managers.llmStreamCachedManager,
      knowledgeBaseManager: managers.knowledgeBaseManager,
      workContextHandler: managers.workContextHandler,
      documentLoaders: managers.documentLoaders,
      employee,
      sessionId,
      systemMessage: options.systemPrompt,
      skillSettings: options.skillSettings,
      webSearch: options.webSearch,
      tools: options.tools,
    };
    const context = createAIEmployeeAgentContextProvider(contextOptions);
    const persistence = new DatabaseConversationPersistence({
      database: contextOptions.database,
      snowflake: contextOptions.snowflake,
      conversations: contextOptions.aiConversations,
      messages: contextOptions.aiMessages,
      toolMessages: contextOptions.aiToolMessages,
      usageEvents: contextOptions.aiUsageEvents,
    });
    const conversation = new ConversationProvider({
      sessionId,
      persistence,
      streamCache: managers.llmStreamCachedManager,
      employeesManager: managers.aiEmployeesManager,
      database: contextOptions.database,
      snowflake: contextOptions.snowflake,
      logger: this.logger,
    });
    return createAgentService(
      createAgentProviders({
        conversation,
        context,
        logger: this.logger,
        converters: new DefaultChatMessageConverters({
          employee: contextOptions.employee,
          skillSettings: contextOptions.skillSettings,
          logger: this.logger,
          actorId: actor.id,
          collectionRepository: contextOptions.collectionRepository,
          workContextHandler: contextOptions.workContextHandler,
          fileStorage: contextOptions.fileStorage,
          documentLoaders: contextOptions.documentLoaders,
          caching: contextOptions.caching,
          getHeader: options.getHeader,
        }),
        checkpointer:
          contextOptions.from === 'sub-agent'
            ? undefined
            : new NativeCollectionSaver({
                checkpoints: contextOptions.lcCheckpoints,
                blobs: contextOptions.lcCheckpointBlobs,
                writes: contextOptions.lcCheckpointWrites,
              }),
      }),
    );
  }

  public async createAgent(
    options: CreateAgentOptions = {},
  ): Promise<AgentService> {
    if (options.providers) return createAgentService(options.providers);
    const repositories = this.repositories;
    const managers = this.managers;
    const sessionId = options.sessionId ?? randomUUID();
    const persistence =
      options.persistence ??
      new DatabaseConversationPersistence({
        database: this.database,
        snowflake: this.container.resolve(idGeneratorToken),
        conversations: repositories.aiConversations,
        messages: repositories.aiMessages,
        toolMessages: repositories.aiToolMessages,
        usageEvents: repositories.aiUsageEvents,
      });
    const model = await this.ai.llmProviderManager.resolveModel(options.model);
    const resolved = await this.ai.llmProviderManager.getLLMService(model);
    const context =
      options.context ??
      new FixedAgentContextProvider({
        sessionId,
        username: options.username,
        model,
        provider: resolved.provider,
        providerName: resolved.service.provider,
        llmService: resolved.service.name,
        systemPrompt: options.systemPrompt,
        tools: new Map(),
      });
    const conversation = new ConversationProvider({
      sessionId,
      persistence,
      streamCache: managers.llmStreamCachedManager,
      employeesManager: managers.aiEmployeesManager,
      database: this.database,
      snowflake: this.container.resolve(idGeneratorToken),
      logger: this.logger,
    });
    return createAgentService(
      createAgentProviders({
        conversation,
        context,
        logger: this.logger,
        converters: undefined,
      }),
    );
  }

  private createContext(
    actor: Actor,
    execution: ConversationExecution,
    translate?: Translate,
    getHeader?: (name: string) => string | undefined,
  ): AppAgentContext {
    const managers = this.managers;
    return createAgentContext({
      actor,
      execution,
      ai: this.ai,
      database: this.container.resolve(databaseManagerToken),
      logger: this.logger,
      repositories: this.repositories,
      aiEmployeesManager: managers.aiEmployeesManager,
      aiConversationsManager: managers.aiConversationsManager,
      builtInManager: managers.builtInManager,
      knowledgeBaseManager: managers.knowledgeBaseManager,
      subAgentsDispatcher: managers.subAgentsDispatcher,
      translate,
      getHeader,
    });
  }
  private get ai(): AIManager {
    return this.container.resolve(aiManagerToken);
  }
  private get repositories(): RepositoryFactory {
    return this.container.resolve(repositoryFactoryToken);
  }
  private get managers(): ManagerFactory {
    return this.container.resolve(managerFactoryToken);
  }
  private get database() {
    return this.container.resolve(databaseManagerToken).connection();
  }
  private get logger() {
    return this.container.resolve(loggingToken).getLogger('ai-employee');
  }
}
