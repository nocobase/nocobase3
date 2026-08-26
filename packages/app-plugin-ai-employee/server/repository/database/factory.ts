import type { DatabaseConnection } from '@nocobase/app-database';

import type {
  AIConversationEntity,
  AIConversationRepository,
  AIEmployeeEntity,
  AIEmployeeRepository,
  AIFileEntity,
  AIFileRepository,
  AIMessageEntity,
  AIMessageRepository,
  AIMCPRepository,
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
  LLMServiceEntity,
  LLMServiceRepository,
  MCPEntity,
  UserAIEmployeeEntity,
  UserAIEmployeeRepository,
} from '@nocobase/ai-employee';
import type {
  CollectionRepository,
  DatabaseRepositoryFactory,
} from '@nocobase/ai-employee';
import { BaseCollectionRepository } from './base-collection-repository.js';

const JSON_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  aiConversations: new Set(['options']),
  aiEmployees: new Set([
    'chatSettings',
    'skillSettings',
    'modelSettings',
    'dataSourceSettings',
    'knowledgeBase',
  ]),
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

export class CollectionRepositoryFactory implements DatabaseRepositoryFactory {
  private readonly records = new Map<string, BaseCollectionRepository<any>>();

  constructor(
    private readonly connection: DatabaseConnection,
    private readonly generateId?: () => string | number | bigint,
  ) {}

  collectionRepository<T extends object>(
    name: string,
  ): CollectionRepository<T> {
    let repository = this.records.get(name);
    if (!repository) {
      repository = new BaseCollectionRepository<T>(
        this.connection,
        name,
        this.generateId,
        JSON_FIELDS[name] ?? new Set(),
      );
      this.records.set(name, repository);
    }
    return repository as unknown as CollectionRepository<T>;
  }

  get aiConversations(): AIConversationRepository {
    return this.collectionRepository<AIConversationEntity>('aiConversations');
  }
  get aiEmployees(): AIEmployeeRepository {
    return this.collectionRepository<AIEmployeeEntity>('aiEmployees');
  }
  get aiFiles(): AIFileRepository {
    return this.collectionRepository<AIFileEntity>('aiFiles');
  }
  get aiMcpClients(): AIMCPRepository {
    return this.collectionRepository<MCPEntity>('aiMcpClients');
  }
  get aiMessages(): AIMessageRepository {
    return this.collectionRepository<AIMessageEntity>('aiMessages');
  }
  get aiSettings(): AISettingsRepository {
    return this.collectionRepository<AISettingsEntity>('aiSettings');
  }
  get aiToolMessages(): AIToolMessageRepository {
    return this.collectionRepository<AIToolMessageEntity>('aiToolMessages');
  }
  get aiUsageEvents(): AIUsageEventRepository {
    return this.collectionRepository<AIUsageEventEntity>('aiUsageEvents');
  }
  get lcCheckpoints(): LCCheckpointRepository {
    return this.collectionRepository<LCCheckpointEntity>('lcCheckpoints');
  }
  get lcCheckpointBlobs(): LCCheckpointBlobRepository {
    return this.collectionRepository<LCCheckpointBlobEntity>(
      'lcCheckpointBlobs',
    );
  }
  get lcCheckpointWrites(): LCCheckpointWriteRepository {
    return this.collectionRepository<LCCheckpointWriteEntity>(
      'lcCheckpointWrites',
    );
  }
  get llmServices(): LLMServiceRepository {
    return this.collectionRepository<LLMServiceEntity>('llmServices');
  }
  get usersAiEmployees(): UserAIEmployeeRepository {
    return this.collectionRepository<UserAIEmployeeEntity>('usersAiEmployees');
  }
}
