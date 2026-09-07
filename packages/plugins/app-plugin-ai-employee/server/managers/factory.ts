import {
  DocumentLoaders,
  fileStorageFactoryToken,
  type AIManager,
  type FileStorageFactory,
} from '@nocobase/ai-employee';
import { cachingToken } from '@nocobase/app-server/caching';
import { databaseManagerToken } from '@nocobase/db';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { loggingToken } from '@nocobase/app-server/logging';
import type { ServiceResolver } from '@nocobase/service-provider';
import packageMetadata from '@nocobase/app-plugin-ai-employee/package.json' with { type: 'json' };

import type { Context } from '../internal/runtime-context.js';
import { repositoryFactoryToken } from '../internal/tokens.js';
import { AIFileMetadataRepository } from '../file-storage/ai-file-metadata-repository.js';
import type { RepositoryFactory } from '../repository/database/factory.js';
import { aiManagerToken } from '../tokens.js';
import { AIConversationsManager } from './ai-conversations-manager.js';
import { AIEmployeesManager } from './ai-employees-manager.js';
import { BuiltInManager } from './built-in-manager.js';
import { KnowledgeBaseManager } from './knowledge-base-manager.js';
import { LLMStreamCachedManager } from './llm-stream-cached-manager.js';
import { SubAgentsDispatcher } from './sub-agents/dispatcher.js';
import {
  createWorkContextHandler,
  type WorkContextHandler,
} from './work-context/index.js';

export interface ManagerFactoryOptions {
  readonly container: ServiceResolver;
}

export interface ManagerFactoryConfiguration {
  readonly aiStorageDisk: string;
}

/** App-container-scoped owner of the plugin's private manager graph. */
export class ManagerFactory {
  private readonly container: ServiceResolver;
  private configuration: ManagerFactoryConfiguration | undefined;
  private contextValue: Context | undefined;
  private fileStorageValue: Context['fileStorage'] | undefined;
  private aiEmployeesManagerValue: AIEmployeesManager | undefined;
  private aiConversationsManagerValue: AIConversationsManager | undefined;
  private builtInManagerValue: BuiltInManager | undefined;
  private llmStreamCachedManagerValue: LLMStreamCachedManager | undefined;
  private knowledgeBaseManagerValue: KnowledgeBaseManager | undefined;
  private workContextHandlerValue: WorkContextHandler | undefined;
  private documentLoadersValue: DocumentLoaders | undefined;
  private subAgentsDispatcherValue: SubAgentsDispatcher | undefined;

  public constructor({ container }: ManagerFactoryOptions) {
    this.container = container;
  }

  public configure(configuration: ManagerFactoryConfiguration): void {
    if (this.configuration) {
      throw new Error('AI employee ManagerFactory is already configured');
    }
    this.configuration = configuration;
  }

  public get aiEmployeesManager(): AIEmployeesManager {
    return (this.aiEmployeesManagerValue ??= new AIEmployeesManager(
      this.repositories,
      this.ai,
    ));
  }

  public get aiConversationsManager(): AIConversationsManager {
    return (this.aiConversationsManagerValue ??= new AIConversationsManager(
      this.ai,
      this.repositories,
    ));
  }

  public get builtInManager(): BuiltInManager {
    return (this.builtInManagerValue ??= new BuiltInManager(
      packageMetadata.name,
    ));
  }

  public get llmStreamCachedManager(): LLMStreamCachedManager {
    return (this.llmStreamCachedManagerValue ??= new LLMStreamCachedManager(
      this.container.resolve(cachingToken),
    ));
  }

  public get knowledgeBaseManager(): KnowledgeBaseManager {
    return (this.knowledgeBaseManagerValue ??= new KnowledgeBaseManager({
      ai: this.ai,
      repositories: this.repositories,
    }));
  }

  public get workContextHandler(): WorkContextHandler {
    return (this.workContextHandlerValue ??= createWorkContextHandler());
  }

  public get documentLoaders(): DocumentLoaders {
    return (this.documentLoadersValue ??= new DocumentLoaders(this.context));
  }

  public get subAgentsDispatcher(): SubAgentsDispatcher {
    return (this.subAgentsDispatcherValue ??= new SubAgentsDispatcher({
      repositories: this.repositories,
      aiEmployeesManager: this.aiEmployeesManager,
      aiConversationsManager: this.aiConversationsManager,
      builtInManager: this.builtInManager,
      llmStreamCachedManager: this.llmStreamCachedManager,
      knowledgeBaseManager: this.knowledgeBaseManager,
      workContextHandler: this.workContextHandler,
      documentLoaders: this.documentLoaders,
    }));
  }

  public get context(): Context {
    if (this.contextValue) return this.contextValue;
    const databaseManager = this.container.resolve(databaseManagerToken);
    this.contextValue = {
      ai: this.ai,
      database: databaseManager.connection(),
      databaseManager,
      logger: this.container.resolve(loggingToken).getLogger('ai-employee'),
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
    };
    return this.contextValue;
  }

  private get fileStorage(): Context['fileStorage'] {
    const configuration = this.requireConfiguration();
    return (this.fileStorageValue ??= this.fileStorageFactory.create({
      disk: configuration.aiStorageDisk,
      prefix: 'ai-files',
      metadataRepository: new AIFileMetadataRepository(
        this.repositories.aiFiles,
      ),
    }));
  }

  private requireConfiguration(): ManagerFactoryConfiguration {
    if (!this.configuration) {
      throw new Error('AI employee ManagerFactory is not configured');
    }
    return this.configuration;
  }

  private get repositories(): RepositoryFactory {
    return this.container.resolve(repositoryFactoryToken);
  }

  private get ai(): AIManager {
    return this.container.resolve(aiManagerToken);
  }

  private get fileStorageFactory(): FileStorageFactory {
    return this.container.resolve(fileStorageFactoryToken);
  }
}
