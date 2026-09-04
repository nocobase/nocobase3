import { randomUUID } from 'node:crypto';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { databaseManagerToken, type DatabaseConnection } from '@nocobase/db';
import type { ServiceResolver } from '@nocobase/service-provider';

import type {
  AIConversationEntity,
  AIConversationRepository,
  AIFileEntity,
  AIFileRepository,
  AIMessageEntity,
  AIMessageRepository,
  AISettingsEntity,
  AISettingsRepository,
  AIToolMessageEntity,
  AIToolMessageRepository,
  AIUsageEventEntity,
  AIUsageEventRepository,
  LCCheckpointBlobEntity,
  LCCheckpointBlobRepository,
  LCCheckpointEntity,
  LCCheckpointRepository,
  LCCheckpointWriteEntity,
  LCCheckpointWriteRepository,
  UserAIEmployeeEntity,
  UserAIEmployeeRepository,
} from '../index.js';
import type {
  AIEmployeeRepository,
  AIMCPRepository,
  CollectionRepository,
  LLMServiceEntity,
  LLMServiceRepository,
  MCPEntity,
} from '@nocobase/ai-employee';
import type { DatabaseRepositoryFactory } from '../runtime-factory.js';
import { DatabaseAIEmployeeRepository } from './ai-employee.js';
import { BaseCollectionRepository } from './base-collection-repository.js';

const JSON_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  aiConversations: new Set(['options']),
  aiFiles: new Set(['meta']),
  aiMcpClients: new Set(['args', 'env', 'headers', 'restart']),
  aiMessages: new Set([
    'content',
    'toolCalls',
    'attachments',
    'workContext',
    'metadata',
  ]),
  aiSettings: new Set(['options']),
  aiToolMessages: new Set(['content', 'interruptAction', 'userDecision']),
  aiUsageEvents: new Set(['rawUsageMetadata', 'rawResponseMetadata']),
  lcCheckpoints: new Set(['checkpoint', 'metadata']),
  llmServices: new Set(['options', 'enabledModels', 'modelOptions']),
};

export interface RepositoryFactoryOptions {
  readonly container: ServiceResolver;
}

export interface DirectRepositoryFactoryOptions {
  readonly connection: DatabaseConnection;
  readonly generateId?: () => string | number | bigint;
}

/** App-container-scoped, lazily-created repository graph for this plugin. */
export class RepositoryFactory implements DatabaseRepositoryFactory {
  private readonly records = new Map<
    string,
    BaseCollectionRepository<object>
  >();
  private readonly connection: DatabaseConnection;
  private readonly generateId: () => string | number | bigint;

  public constructor(
    options: RepositoryFactoryOptions | DirectRepositoryFactoryOptions,
  ) {
    if ('container' in options) {
      const database = options.container.resolve(databaseManagerToken);
      const idGenerator = options.container.resolve(idGeneratorToken);
      this.connection = database.connection();
      this.generateId = () => String(idGenerator.generate());
      return;
    }
    this.connection = options.connection;
    this.generateId = options.generateId ?? randomUUID;
  }

  public collectionRepository<T extends object>(
    name: string,
  ): CollectionRepository<T> {
    let repository = this.records.get(name);
    if (!repository) {
      repository = new BaseCollectionRepository<T>(
        this.connection,
        name,
        this.generateId,
        JSON_FIELDS[name] ?? new Set(),
      ) as BaseCollectionRepository<object>;
      this.records.set(name, repository);
    }
    return repository as unknown as CollectionRepository<T>;
  }

  public get aiConversations(): AIConversationRepository {
    return this.collectionRepository<AIConversationEntity>('aiConversations');
  }

  public get aiEmployees(): AIEmployeeRepository {
    const name = 'aiEmployees';
    let repository = this.records.get(name);
    if (!repository) {
      repository = new DatabaseAIEmployeeRepository(
        this.connection,
        this.generateId,
      ) as unknown as BaseCollectionRepository<object>;
      this.records.set(name, repository);
    }
    return repository as unknown as DatabaseAIEmployeeRepository;
  }

  public get aiFiles(): AIFileRepository {
    return this.collectionRepository<AIFileEntity>('aiFiles');
  }

  public get aiMcpClients(): AIMCPRepository {
    return this.collectionRepository<MCPEntity>('aiMcpClients');
  }

  public get aiMessages(): AIMessageRepository {
    return this.collectionRepository<AIMessageEntity>('aiMessages');
  }

  public get aiSettings(): AISettingsRepository {
    return this.collectionRepository<AISettingsEntity>('aiSettings');
  }

  public get aiToolMessages(): AIToolMessageRepository {
    return this.collectionRepository<AIToolMessageEntity>('aiToolMessages');
  }

  public get aiUsageEvents(): AIUsageEventRepository {
    return this.collectionRepository<AIUsageEventEntity>('aiUsageEvents');
  }

  public get lcCheckpoints(): LCCheckpointRepository {
    return this.collectionRepository<LCCheckpointEntity>('lcCheckpoints');
  }

  public get lcCheckpointBlobs(): LCCheckpointBlobRepository {
    return this.collectionRepository<LCCheckpointBlobEntity>(
      'lcCheckpointBlobs',
    );
  }

  public get lcCheckpointWrites(): LCCheckpointWriteRepository {
    return this.collectionRepository<LCCheckpointWriteEntity>(
      'lcCheckpointWrites',
    );
  }

  public get llmServices(): LLMServiceRepository {
    return this.collectionRepository<LLMServiceEntity>('llmServices');
  }

  public get usersAiEmployees(): UserAIEmployeeRepository {
    return this.collectionRepository<UserAIEmployeeEntity>('usersAiEmployees');
  }
}
