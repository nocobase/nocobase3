import type {
  AIConversationRepository,
  AIEmployeeRepository,
  AIFileRepository,
  AIMessageRepository,
  AIMCPRepository,
  AISettingsRepository,
  AIToolMessageRepository,
  AIUsageEventRepository,
  LCCheckpointBlobRepository,
  LCCheckpointRepository,
  LCCheckpointWriteRepository,
  LLMServiceRepository,
  UserAIEmployeeRepository,
} from './index.js';
import type { CollectionRepository } from '../../repository/collection.js';

/** Provides the database-backed repository instances consumed by one AI runtime. */
export interface DatabaseRepositoryFactory {
  collectionRepository<T extends object>(name: string): CollectionRepository<T>;
  get aiConversations(): AIConversationRepository;
  get aiEmployees(): AIEmployeeRepository;
  get aiFiles(): AIFileRepository;
  get aiMcpClients(): AIMCPRepository;
  get aiMessages(): AIMessageRepository;
  get aiSettings(): AISettingsRepository;
  get aiToolMessages(): AIToolMessageRepository;
  get aiUsageEvents(): AIUsageEventRepository;
  get lcCheckpoints(): LCCheckpointRepository;
  get lcCheckpointBlobs(): LCCheckpointBlobRepository;
  get lcCheckpointWrites(): LCCheckpointWriteRepository;
  get llmServices(): LLMServiceRepository;
  get usersAiEmployees(): UserAIEmployeeRepository;
}
