import { nocobaseClient } from '@nocobase/app-portal-sdk/client';
import { createKnowledgeBaseService } from './knowledge-base-factory.js';

export {
  createKnowledgeBaseService,
  normalizeKnowledgeBaseMutation,
  normalizeVectorDatabaseMutation,
} from './knowledge-base-factory.js';

/** The default Knowledge base workspace integration for compatible user-side Knowledge Base actions. */
export const knowledgeBaseService = createKnowledgeBaseService(nocobaseClient);
