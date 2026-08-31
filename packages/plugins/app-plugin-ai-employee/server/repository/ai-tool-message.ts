import type { CollectionRepository } from '@nocobase/ai-employee';
import type { UserDecision } from '@nocobase/ai-employee';

export type AIToolMessageEntity = {
  id?: string | number | bigint;
  sessionId?: string;
  messageId?: string | number | bigint;
  toolCallId?: string;
  toolName?: string;
  status?: string;
  content?: string;
  invokeStatus?: string;
  invokeStartTime?: Date | string | number;
  invokeEndTime?: Date | string | number;
  auto?: boolean;
  execution?: string;
  interruptActionOrder?: number;
  interruptAction?: unknown;
  userDecision?: UserDecision;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export interface AIToolMessageRepository extends CollectionRepository<AIToolMessageEntity> {}
