import type { CollectionRepository } from '@nocobase/ai-employee';
import type { AIEmployeeEntity } from '@nocobase/ai-employee';

export type AIConversationEntity = {
  id?: string | number | bigint;
  sessionId?: string;
  thread?: number;
  topicId?: string;
  from?: string;
  scope?: string;
  userId?: string | number | bigint;
  aiEmployeeUsername?: string;
  aiEmployee?: Partial<AIEmployeeEntity>;
  title?: string;
  options?: Record<string, unknown>;
  llmActiveState?: string;
  category?: string;
  read?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export interface AIConversationRepository extends CollectionRepository<AIConversationEntity> {}
