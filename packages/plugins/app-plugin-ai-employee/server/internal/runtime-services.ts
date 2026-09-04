import type { DocumentLoaders } from '@nocobase/ai-employee';
import type { KnowledgeBaseManager } from '../agent/ai-employee/ai-knowledge-base.js';
import type { WorkContextHandler } from '../agent/ai-employee/work-context/index.js';
import type { AIConversationsManager } from '../ai-employees/ai-conversations.js';
import type { AIEmployeesManager } from '../ai-employees/ai-employees-manager.js';
import type { BuiltInManager } from '../ai-employees/built-in-manager.js';
import type { LLMStreamCachedManager } from '../ai-employees/llm-stream-manager.js';
import type { SubAgentsDispatcher } from '../ai-employees/sub-agents/dispatcher.js';

/** App-scoped runtime collaborators. These must never be copied onto request Context. */
export interface RuntimeServices {
  aiEmployeesManager: AIEmployeesManager;
  aiConversationsManager: AIConversationsManager;
  builtInManager: BuiltInManager;
  llmStreamCachedManager: LLMStreamCachedManager;
  subAgentsDispatcher: SubAgentsDispatcher;
  knowledgeBaseManager: KnowledgeBaseManager;
  workContextHandler: WorkContextHandler;
  documentLoaders: DocumentLoaders;
}
