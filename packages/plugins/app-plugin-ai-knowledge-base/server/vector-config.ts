import { createHash } from 'node:crypto';

export const KNOWLEDGE_BASE_VECTOR_CONFIG_FIELDS = [
  'vectorDatabaseKey',
  'llmService',
  'embeddingModel',
] as const;

export type KnowledgeBaseVectorConfigField =
  (typeof KNOWLEDGE_BASE_VECTOR_CONFIG_FIELDS)[number];

export interface KnowledgeBaseVectorConfig {
  readonly vectorDatabaseKey?: unknown;
  readonly llmService?: unknown;
  readonly embeddingModel?: unknown;
}

export interface NormalizedKnowledgeBaseVectorConfig {
  readonly vectorDatabaseKey: string | null;
  readonly llmService: string | null;
  readonly embeddingModel: string | null;
}

function normalizeConfigValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function normalizeKnowledgeBaseVectorConfig(
  config: KnowledgeBaseVectorConfig,
): NormalizedKnowledgeBaseVectorConfig {
  return {
    vectorDatabaseKey: normalizeConfigValue(config.vectorDatabaseKey),
    llmService: normalizeConfigValue(config.llmService),
    embeddingModel: normalizeConfigValue(config.embeddingModel),
  };
}

export function buildVectorStoreConfigHash(
  config: KnowledgeBaseVectorConfig,
): string | null {
  const normalized = normalizeKnowledgeBaseVectorConfig(config);
  if (
    !normalized.vectorDatabaseKey ||
    !normalized.llmService ||
    !normalized.embeddingModel
  ) {
    return null;
  }
  return createHash('sha256')
    .update(
      JSON.stringify({
        embeddingModel: normalized.embeddingModel,
        llmService: normalized.llmService,
        vectorDatabaseKey: normalized.vectorDatabaseKey,
      }),
    )
    .digest('hex');
}

export function hasKnowledgeBaseVectorConfigChanged(
  previous: KnowledgeBaseVectorConfig,
  next: KnowledgeBaseVectorConfig,
): boolean {
  const previousConfig = normalizeKnowledgeBaseVectorConfig(previous);
  const nextConfig = normalizeKnowledgeBaseVectorConfig(next);
  return KNOWLEDGE_BASE_VECTOR_CONFIG_FIELDS.some(
    (field) => previousConfig[field] !== nextConfig[field],
  );
}
