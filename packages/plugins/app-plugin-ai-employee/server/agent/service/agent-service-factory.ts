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
import type { AIEmployeeSkillSettings } from '../context/ai-employee/options.js';
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
      llmProviderManager: this.ai.llmProviderManager,
      toolsManager: this.ai.toolsManager,
      skillsManager: this.ai.skillsManager,
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
      database: this.database,
      snowflake: this.container.resolve(idGeneratorToken),
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
          collectionRepository:
            repositories.collectionRepository.bind(repositories),
          workContextHandler: managers.workContextHandler,
          fileStorage: managers.fileStorage,
          documentLoaders: managers.documentLoaders,
          caching: this.container.resolve(cachingToken),
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
    translate?: Translate,
    getHeader?: (name: string) => string | undefined,
  ): AppAgentContext {
    const managers = this.managers;
    return createAgentContext({
      actor,
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
