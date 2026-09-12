import type {
  CollectionRepository,
  RepositoryOptions,
} from '@nocobase/ai-employee';

export type AIUsageEventEntity = {
  id?: string | number | bigint;
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
  rawUsageMetadata?: Record<string, unknown>;
  rawResponseMetadata?: Record<string, unknown>;
};

export type AIUsageEventUpsertValues = Omit<
  AIUsageEventEntity,
  'messageId' | 'eventType'
> & {
  messageId: string | number;
  eventType: string;
};

export interface AIUsageEventRepository extends CollectionRepository<AIUsageEventEntity> {
  upsert(
    values: AIUsageEventUpsertValues,
    options?: RepositoryOptions,
  ): Promise<void>;
}
