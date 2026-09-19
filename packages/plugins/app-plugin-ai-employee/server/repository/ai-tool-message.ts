import type { CollectionRepository } from '@nocobase/ai-employee';
import type { UserDecision } from '@nocobase/ai-employee';

export type AIToolMessageEntity = {
  id?: string | number | bigint;
  sessionId?: string;
  messageId?: string | number | bigint;
  toolCallId?: string;
  toolName?: string;
  status?: string | null;
  content?: unknown;
  invokeStatus?: string;
  invokeStartTime?: Date | string | number | null;
  invokeEndTime?: Date | string | number | null;
  auto?: boolean;
  execution?: string;
  interruptActionOrder?: number;
  interruptAction?: unknown;
  userDecision?: UserDecision;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export interface AIToolMessageRepository extends CollectionRepository<AIToolMessageEntity> {}
