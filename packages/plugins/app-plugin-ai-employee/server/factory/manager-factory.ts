import {
  DocumentLoaders,
  fileStorageFactoryToken,
  type AIManager,
  type FileStorage,
  type FileStorageFactory,
} from '@nocobase/ai-employee';
import { cachingToken } from '@nocobase/app-server/caching';
import {
  createServiceToken,
  type ServiceResolver,
  type ServiceToken,
} from '@nocobase/service-provider';
import packageMetadata from '@nocobase/app-plugin-ai-employee/package.json' with { type: 'json' };

import type { AIFileEntity } from '../repository/ai-file.js';
import type { AIFileMetadataCreateContext } from '../repository/file-storage/ai-file-metadata-repository.js';
import { AIFileMetadataRepository } from '../repository/file-storage/ai-file-metadata-repository.js';
import {
  type RepositoryFactory,
  repositoryFactoryToken,
} from './repository-factory.js';
import { aiManagerToken } from '../provider/ai-employee.js';
import { AIConversationsManager } from '../manager/ai-conversations-manager.js';
import { AIEmployeesManager } from '../manager/ai-employees-manager.js';
import { BuiltInManager } from '../manager/built-in-manager.js';
import { KnowledgeBaseManager } from '../manager/knowledge-base-manager.js';
import { LLMStreamCachedManager } from '../manager/llm-stream-cached-manager.js';
import { SubAgentsDispatcher } from '../manager/sub-agents/dispatcher.js';
import {
  createWorkContextHandler,
  type WorkContextHandler,
} from '../manager/work-context/index.js';

export const managerFactoryToken: ServiceToken<ManagerFactory> =
  createServiceToken<ManagerFactory>(
    '@nocobase/app-plugin-ai-employee/internal/managers',
  );

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
  private fileStorageValue:
    FileStorage<AIFileEntity, AIFileMetadataCreateContext> | undefined;
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
    return (this.documentLoadersValue ??= new DocumentLoaders({
      caching: this.container.resolve(cachingToken),
      fileStorage: this.fileStorage,
    }));
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

  public get fileStorage(): FileStorage<
    AIFileEntity,
    AIFileMetadataCreateContext
  > {
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
