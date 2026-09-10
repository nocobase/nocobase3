import type {
  AIEmployee,
  DocumentLoaders,
  FileStorage,
} from '@nocobase/ai-employee';
import type { Caching } from '@nocobase/caching';
import type { DatabaseConnection } from '@nocobase/db';
import type { IdGeneratorService } from '@nocobase/snowflake';

import type { AIEmployeeRepository } from '@nocobase/ai-employee';
import type { CollectionRepositoryResolver } from './attachments.js';
import type {
  AIConversationRepository,
  AIMessageRepository,
  AIToolMessageRepository,
  LCCheckpointBlobRepository,
  LCCheckpointRepository,
  LCCheckpointWriteRepository,
  UserAIEmployeeRepository,
} from '../../repository/index.js';
import type { AIFileEntity } from '../../repository/ai-file.js';
import type { AIFileMetadataCreateContext } from '../../repository/file-storage/ai-file-metadata-repository.js';
import type { AIEmployeesManager } from '../../manager/ai-employees-manager.js';
import type { BuiltInManager } from '../../manager/built-in-manager.js';
import type { KnowledgeBaseManager } from '../../manager/knowledge-base-manager.js';
import type { LLMStreamCachedManager } from '../../manager/llm-stream-cached-manager.js';
import type { WorkContextHandler } from '../../manager/work-context/index.js';
import type { ModelRef } from '../../types.js';
import type { AppAgentContext } from '../context.js';
import type { ConversationExecution } from '../contracts.js';

export interface AIEmployeeSkillSettings {
  tools?: string[];
  toolsVersion?: string | number;
  skills?: string[];
  skillsVersion?: string | number;
}

export interface AIEmployeeAgentOptions {
  agentContext: AppAgentContext;
  database: DatabaseConnection;
  caching: Caching;
  fileStorage: FileStorage<AIFileEntity, AIFileMetadataCreateContext>;
  snowflake: IdGeneratorService;
  execution?: ConversationExecution;
  getHeader?: (name: string) => string | undefined;
  collectionRepository: CollectionRepositoryResolver;
  aiConversations: AIConversationRepository;
  aiEmployees: AIEmployeeRepository;
  aiMessages: AIMessageRepository;
  aiToolMessages: AIToolMessageRepository;
  usersAiEmployees: UserAIEmployeeRepository;
  lcCheckpoints: LCCheckpointRepository;
  lcCheckpointBlobs: LCCheckpointBlobRepository;
  lcCheckpointWrites: LCCheckpointWriteRepository;
  aiEmployeesManager: AIEmployeesManager;
  builtInManager: BuiltInManager;
  llmStreamCachedManager: LLMStreamCachedManager;
  knowledgeBaseManager: KnowledgeBaseManager;
  workContextHandler: WorkContextHandler;
  documentLoaders: DocumentLoaders;
  employee: AIEmployee;
  sessionId: string;
  systemMessage?: string;
  skillSettings?: AIEmployeeSkillSettings;
  webSearch?: boolean;
  model?: ModelRef;
  legacy?: boolean;
  from?: 'main-agent' | 'sub-agent';
  tools?: { name: string }[];
}
