import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DocumentLoaders,
  type AIManager,
  type FileStorageFactory,
} from '@nocobase/ai-employee';
import { cachingToken } from '@nocobase/app-server/caching';
import { databaseManagerToken } from '@nocobase/db';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { loggingToken } from '@nocobase/app-server/logging';
import type { ConfigPaths } from '@nocobase/app-server/config';
import type { ServiceContainer } from '@nocobase/service-provider';
import packageMetadata from '@nocobase/app-plugin-ai-employee/package.json' with { type: 'json' };

import type { AIEmployeeLLMServiceConfig } from '../config.js';
import type { Context, CurrentUser } from '../internal/runtime-context.js';
import type { RuntimeServices } from '../internal/runtime-services.js';
import { createWorkContextHandler } from '../agent/ai-employee/work-context/index.js';
import { KnowledgeBaseManager } from '../agent/ai-employee/ai-knowledge-base.js';
import { AIConversationsManager } from '../ai-employees/ai-conversations.js';
import { AIEmployeesManager } from '../ai-employees/ai-employees-manager.js';
import { BuiltInManager } from '../ai-employees/built-in-manager.js';
import { LLMStreamCachedManager } from '../ai-employees/llm-stream-manager.js';
import { SubAgentsDispatcher } from '../ai-employees/sub-agents/dispatcher.js';
import { AIFileMetadataRepository } from '../file-storage/ai-file-metadata-repository.js';
import { repositoryFactoryToken } from '../internal/tokens.js';
import { LLMServiceConfigSynchronizer } from '../llm-service-config.js';
import { AI_API_BASE_PATH } from '../domain/api-contracts.js';
import { aiManagerToken } from '../tokens.js';
import { fileStorageFactoryToken } from '@nocobase/ai-employee';
import { AIConversationService } from './ai-conversation-service.js';
import { AIEmployeeService } from './ai-employee-service.js';
import { AIMCPServerService } from './ai-mcp-server-service.js';
import { AISkillService } from './ai-skill-service.js';
import { AIToolService } from './ai-tool-service.js';
import { AIFileService } from './file-service.js';
import { LLMService } from './llm-service.js';
import { ModelService } from './model-service.js';
import { loadResources, resolveAIDirectory } from './resource-loader.js';

export interface ServiceFactoryOptions {
  readonly container: ServiceContainer;
}

export interface ServiceFactoryInitialization {
  readonly paths: ConfigPaths;
  readonly aiStorageDisk: string;
  readonly llmServices?: readonly AIEmployeeLLMServiceConfig[];
  readonly loadResources?: boolean;
}

/** App-container-scoped owner of all plugin services and mutable collaborators. */
export class ServiceFactory {
  private readonly container: ServiceContainer;
  private initialization: ServiceFactoryInitialization | undefined;
  private readyPromise: Promise<void> | undefined;
  private runtimeContextValue: Context | undefined;
  private runtimeServicesValue: RuntimeServices | undefined;
  private employeeServiceValue: AIEmployeeService | undefined;
  private modelServiceValue: ModelService | undefined;
  private fileServiceValue: AIFileService | undefined;
  private fileStorageValue: Context['fileStorage'] | undefined;
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
      fileStorage: this.fileStorage,
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
    return (this.conversationServiceValue ??= new AIConversationService({
      repositories: this.repositories,
      runtime: this.runtimeServices,
    }));
  }

  /** Creates request-local state while retaining only App-scoped collaborators. */
  public createRequestRuntime(actor: CurrentUser, request?: Request): Context {
    const runtime = this.runtimeContext;
    const currentRole = actor.isRoot ? 'root' : (actor.roles[0] ?? 'member');
    return {
      ...runtime,
      currentUser: actor,
      auth: { user: { id: actor.id, username: String(actor.id) } },
      state: {
        currentUser: { id: actor.id, username: String(actor.id) },
        currentRole,
        currentRoles: actor.roles,
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

  private get runtimeContext(): Context {
    if (this.runtimeContextValue) return this.runtimeContextValue;
    const databaseManager = this.container.resolve(databaseManagerToken);
    const runtime = {
      ai: this.ai,
      database: databaseManager.connection(),
      databaseManager,
      logger: this.logger,
      caching: this.container.resolve(cachingToken),
      snowflake: this.container.resolve(idGeneratorToken),
      fileStorage: this.fileStorage,
      i18nNamespace: packageMetadata.name,
      currentUser: { id: 'system', roles: ['root'], isRoot: true },
      auth: { user: { id: 'system', username: 'system' } },
      state: { currentRoles: ['root'], currentRole: 'root' },
      get: () => undefined,
      set: () => undefined,
      t: (key: string) => key,
      getCurrentLocale: () => undefined,
    } as unknown as Context;
    this.runtimeContextValue = runtime;
    return runtime;
  }

  public get runtimeServices(): RuntimeServices {
    if (this.runtimeServicesValue) return this.runtimeServicesValue;
    const ctx = this.runtimeContext;
    const aiEmployeesManager = new AIEmployeesManager(
      this.repositories,
      this.ai,
      ctx.sendSyncMessage,
    );
    const aiConversationsManager = new AIConversationsManager(
      ctx,
      this.repositories,
    );
    const llmStreamCachedManager = new LLMStreamCachedManager(ctx);
    const builtInManager = new BuiltInManager(ctx.i18nNamespace);
    const services = {} as RuntimeServices;
    services.aiEmployeesManager = aiEmployeesManager;
    services.aiConversationsManager = aiConversationsManager;
    services.llmStreamCachedManager = llmStreamCachedManager;
    services.builtInManager = builtInManager;
    services.subAgentsDispatcher = new SubAgentsDispatcher({
      ctx,
      repositories: this.repositories,
      runtime: services,
    });
    services.knowledgeBaseManager = new KnowledgeBaseManager({
      ctx,
      repositories: this.repositories,
    });
    services.workContextHandler = createWorkContextHandler();
    services.documentLoaders = new DocumentLoaders(ctx);
    this.runtimeServicesValue = services;
    return services;
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

  private get fileStorage(): Context['fileStorage'] {
    const initialization = this.requireInitialization();
    return (this.fileStorageValue ??= this.fileStorageFactory.create({
      disk: initialization.aiStorageDisk,
      prefix: 'ai-files',
      metadataRepository: new AIFileMetadataRepository(
        this.repositories.aiFiles,
      ),
    }));
  }

  private get fileStorageFactory(): FileStorageFactory {
    return this.container.resolve(fileStorageFactoryToken);
  }

  private get logger() {
    return this.container.resolve(loggingToken).getLogger('ai-employee');
  }
}
