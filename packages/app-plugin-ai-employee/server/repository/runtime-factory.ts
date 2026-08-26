import type {
  AIEmployeeRepository,
  AIMCPRepository,
  CollectionRepository,
  LLMServiceRepository,
} from '@nocobase/ai-employee';
import type {
  AIConversationRepository,
  AIFileRepository,
  AIMessageRepository,
  AISettingsRepository,
  AIToolMessageRepository,
  AIUsageEventRepository,
  LCCheckpointBlobRepository,
  LCCheckpointRepository,
  LCCheckpointWriteRepository,
  UserAIEmployeeRepository,
} from './index.js';

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
