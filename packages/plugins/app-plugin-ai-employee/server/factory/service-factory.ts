import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type AIManager } from '@nocobase/ai-employee';
import { databaseManagerToken } from '@nocobase/db';
import { cachingToken } from '@nocobase/app-server/caching';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { loggingToken } from '@nocobase/app-server/logging';
import type { ConfigPaths } from '@nocobase/app-server/config';
import {
  createServiceToken,
  type ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { AIEmployeeLLMServiceConfig } from '../config.js';
import type { Context } from '../internal/runtime-context.js';
import type { Actor } from '../domain/contracts.js';
import { type ManagerFactory, managerFactoryToken } from './manager-factory.js';
import { repositoryFactoryToken } from './repository-factory.js';
import { LLMServiceConfigSynchronizer } from '../manager/llm-service-config.js';
import { AI_API_BASE_PATH } from '../domain/api-contracts.js';
import { aiManagerToken } from '../provider/ai-employee.js';
import { AIConversationService } from '../service/ai-conversation-service.js';
import { AIEmployeeService } from '../service/ai-employee-service.js';
import { AIMCPServerService } from '../service/ai-mcp-server-service.js';
import { AISkillService } from '../service/ai-skill-service.js';
import { AIToolService } from '../service/ai-tool-service.js';
import { AIFileService } from '../service/file-service.js';
import { LLMService } from '../service/llm-service.js';
import { ModelService } from '../service/model-service.js';
import {
  loadResources,
  resolveAIDirectory,
} from '../service/resource-loader.js';

export const serviceFactoryToken: ServiceToken<ServiceFactory> =
  createServiceToken<ServiceFactory>(
    '@nocobase/app-plugin-ai-employee/internal/services',
  );

export interface ServiceFactoryOptions {
  readonly container: ServiceContainer;
}

export interface ServiceFactoryInitialization {
  readonly paths: ConfigPaths;
  readonly llmServices?: readonly AIEmployeeLLMServiceConfig[];
  readonly loadResources?: boolean;
}

/** App-container-scoped owner of all plugin services and mutable collaborators. */
export class ServiceFactory {
  private readonly container: ServiceContainer;
  private initialization: ServiceFactoryInitialization | undefined;
  private readyPromise: Promise<void> | undefined;
  private employeeServiceValue: AIEmployeeService | undefined;
  private modelServiceValue: ModelService | undefined;
  private fileServiceValue: AIFileService | undefined;
  private toolServiceValue: AIToolService | undefined;
  private skillServiceValue: AISkillService | undefined;
  private llmServiceValue: LLMService | undefined;
  private mcpServerServiceValue: AIMCPServerService | undefined;
  private conversationServiceValue: AIConversationService | undefined;
  private synchronizerValue: LLMServiceConfigSynchronizer | undefined;

  public constructor({ container }: ServiceFactoryOptions) {
    this.container = container;
  }

  public configure(options: ServiceFactoryInitialization): void {
    if (this.initialization) {
      throw new Error('AI employee ServiceFactory is already configured');
    }
    this.initialization = options;
  }

  public initialize(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.initializeResources();
    }
    return this.readyPromise;
  }

  public ready(): Promise<void> {
    return (
      this.readyPromise ??
      Promise.reject(
        new Error('AI employee ServiceFactory has not been initialized'),
      )
    );
  }

  public get llmServiceConfigSynchronizer(): LLMServiceConfigSynchronizer {
    return (this.synchronizerValue ??= new LLMServiceConfigSynchronizer(
      this.ai.llmServiceManager,
      this.logger,
    ));
  }

  public get employeeService(): AIEmployeeService {
    return (this.employeeServiceValue ??= new AIEmployeeService({
      ai: this.ai,
      repositories: this.repositories,
      database: this.container.resolve(databaseManagerToken).connection(),
    }));
  }

  public get modelService(): ModelService {
    return (this.modelServiceValue ??= new ModelService({ ai: this.ai }));
  }

  public get fileService(): AIFileService {
    return (this.fileServiceValue ??= new AIFileService({
      fileStorage: this.managers.fileStorage,
      snowflake: this.container.resolve(idGeneratorToken),
      apiBasePath: AI_API_BASE_PATH,
    }));
  }

  public get toolService(): AIToolService {
    return (this.toolServiceValue ??= new AIToolService({ ai: this.ai }));
  }

  public get skillService(): AISkillService {
    return (this.skillServiceValue ??= new AISkillService({ ai: this.ai }));
  }

  public get llmService(): LLMService {
    return (this.llmServiceValue ??= new LLMService({ ai: this.ai }));
  }

  public get mcpServerService(): AIMCPServerService {
    return (this.mcpServerServiceValue ??= new AIMCPServerService({
      ai: this.ai,
    }));
  }

  public get conversationService(): AIConversationService {
    const managers = this.managers;
    return (this.conversationServiceValue ??= new AIConversationService({
      repositories: this.repositories,
      aiEmployeesManager: managers.aiEmployeesManager,
      aiConversationsManager: managers.aiConversationsManager,
      builtInManager: managers.builtInManager,
      llmStreamCachedManager: managers.llmStreamCachedManager,
      subAgentsDispatcher: managers.subAgentsDispatcher,
      knowledgeBaseManager: managers.knowledgeBaseManager,
      workContextHandler: managers.workContextHandler,
      documentLoaders: managers.documentLoaders,
    }));
  }

  /** Creates request-local state while retaining only App-scoped collaborators. */
  public createRequestRuntime(actor: Actor, request?: Request): Context {
    const databaseManager = this.container.resolve(databaseManagerToken);
    const currentRole = actor.isRoot ? 'root' : (actor.roles[0] ?? 'member');
    return {
      ai: this.ai,
      database: databaseManager.connection(),
      databaseManager,
      logger: this.logger,
      caching: this.container.resolve(cachingToken),
      snowflake: this.container.resolve(idGeneratorToken),
      fileStorage: this.managers.fileStorage,
      currentUser: actor,
      auth: { user: { id: actor.id, username: String(actor.id) } },
      state: {
        currentUser: { id: actor.id, username: String(actor.id) },
        currentRole,
        currentRoles: [...actor.roles],
      },
      getCurrentLocale: () =>
        actor.locale ?? request?.headers.get('x-locale') ?? undefined,
      get: (name: string) => request?.headers.get(name) ?? undefined,
      set: () => undefined,
      status: undefined,
      t: (key: string) => key,
      throw: (status: number, message?: string): never => {
        const error: Error & { status?: number } = new Error(
          message ?? `Request failed with status ${status}`,
        );
        error.status = status;
        throw error;
      },
      requestExecution: undefined,
    };
  }

  private async initializeResources(): Promise<void> {
    const initialization = this.requireInitialization();
    await this.ai.employeeManager.switchRepository(
      this.repositories.aiEmployees,
    );
    await this.llmServiceConfigSynchronizer.enqueue(initialization.llmServices);
    await this.ai.llmServiceManager.switchRepository(
      this.repositories.llmServices,
    );
    if (initialization.loadResources === false) return;

    const packageDirectory = resolveAIDirectory(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        'ai',
      ),
    );
    const appDirectory = resolveAIDirectory(initialization.paths.root('ai'));
    await loadResources({
      ai: this.ai,
      logger: this.logger,
      aiDirectory: packageDirectory,
    });
    const summary = await loadResources({
      ai: this.ai,
      logger: this.logger,
      aiDirectory: appDirectory,
      overrideTools: true,
    });
    this.logger.info?.(
      { aiDirectory: appDirectory, summary },
      'AI employee services initialized',
    );
  }

  private requireInitialization(): ServiceFactoryInitialization {
    if (!this.initialization) {
      throw new Error('AI employee ServiceFactory is not configured');
    }
    return this.initialization;
  }

  private get repositories() {
    return this.container.resolve(repositoryFactoryToken);
  }

  private get ai(): AIManager {
    return this.container.resolve(aiManagerToken);
  }

  private get managers(): ManagerFactory {
    return this.container.resolve(managerFactoryToken);
  }

  private get logger() {
    return this.container.resolve(loggingToken).getLogger('ai-employee');
  }
}
