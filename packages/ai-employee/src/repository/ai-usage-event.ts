import type { CollectionRepository } from './collection.js';

export type AIUsageEventEntity = {
  occurredAt?: Date | string | number | bigint;
  sessionId?: string;
  messageId?: string | number | bigint;
  userId?: string | number | bigint;
  aiEmployeeUsername?: string;
  from?: string;
  category?: string;
  eventType?: string;
  role?: string;
  provider?: string;
  llmService?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  toolCallCount?: number;
  autoToolCallCount?: number;
  status?: string;
  rawUsageMetadata?: unknown;
  rawResponseMetadata?: unknown;
};

export interface AIUsageEventRepository extends CollectionRepository<AIUsageEventEntity> {}
