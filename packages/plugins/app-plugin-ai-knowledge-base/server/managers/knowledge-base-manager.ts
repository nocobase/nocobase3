import { nanoid } from 'nanoid';

import type { SegmentOptions } from '../internal-types.js';
import type {
  KnowledgeBaseDocumentRepository,
  KnowledgeBaseEntity,
  KnowledgeBaseRepository,
} from '../repository/index.js';
import {
  buildVectorStoreConfigHash,
  hasKnowledgeBaseVectorConfigChanged,
  normalizeKnowledgeBaseVectorConfig,
  type NormalizedKnowledgeBaseVectorConfig,
} from '../vector-config.js';
import { normalizeSegmentOptions } from './segment-options.js';

const BUILT_IN_VECTOR_STORE_PROVIDERS = {
  LOCAL: 'NocobaseLocalVectorStore',
  READONLY: 'NocobaseReadOnlyVectorStore',
} as const;

export class KnowledgeBaseManager {
  public constructor(
    private readonly bases: KnowledgeBaseRepository,
    private readonly documents: KnowledgeBaseDocumentRepository,
    private readonly allowedStorageDisks: readonly string[],
  ) {}

  public async create(
    values: Record<string, unknown>,
  ): Promise<KnowledgeBaseEntity> {
    const type = this.requireKnowledgeBaseType(values.knowledgeBaseType);
    const vectorConfig =
      type === 'EXTERNAL'
        ? normalizeKnowledgeBaseVectorConfig({})
        : normalizeKnowledgeBaseVectorConfig(values);
    this.validateVectorConfig(type, vectorConfig);
    const disk = this.requireAllowedStorageDisk(values.disk);
    const now = new Date();
    const baseValues = this.withoutManagedValues(values);

    return this.bases.create({
      ...baseValues,
      ...vectorConfig,
      vectorStoreConfigHash: buildVectorStoreConfigHash(vectorConfig),
      vectorStoreUpdatedAt: type === 'EXTERNAL' ? null : now,
      disk,
      key: String(values.key ?? nanoid(32)),
      knowledgeBaseType: type,
      knowledgeBaseOuterId: String(values.knowledgeBaseOuterId ?? nanoid(32)),
      vectorStoreProvider: this.resolveVectorStoreProvider(type, values),
      segmentOptions: normalizeSegmentOptions(values.segmentOptions),
      enabled: values.enabled !== false,
      documentCount: 0,
      characterCount: 0,
      aiEmployeeCount: 0,
      confirmVectorStoreChanged: now,
    });
  }

  public async update(
    id: string | number,
    values: Record<string, unknown>,
  ): Promise<KnowledgeBaseEntity | null> {
    const base = await this.bases.findById(id);
    if (!base) return null;

    const type = this.requireKnowledgeBaseType(
      values.knowledgeBaseType ?? base.knowledgeBaseType,
    );
    const nextVectorConfig =
      type === 'EXTERNAL'
        ? normalizeKnowledgeBaseVectorConfig({})
        : normalizeKnowledgeBaseVectorConfig({
            vectorDatabaseKey:
              values.vectorDatabaseKey === undefined
                ? base.vectorDatabaseKey
                : values.vectorDatabaseKey,
            llmService:
              values.llmService === undefined
                ? base.llmService
                : values.llmService,
            embeddingModel:
              values.embeddingModel === undefined
                ? base.embeddingModel
                : values.embeddingModel,
          });
    this.validateVectorConfig(type, nextVectorConfig);
    const vectorConfigChanged = hasKnowledgeBaseVectorConfigChanged(
      base,
      nextVectorConfig,
    );
    const disk =
      values.disk === undefined
        ? undefined
        : this.requireAllowedStorageDisk(values.disk);
    const baseValues = this.withoutManagedValues(values);

    const vectorStoreProvider = this.resolveVectorStoreProvider(
      type,
      values,
      base,
    );
    await this.bases.update(
      { id },
      {
        ...baseValues,
        vectorStoreProvider,
        ...(disk ? { disk } : {}),
        ...(values.segmentOptions !== undefined
          ? { segmentOptions: normalizeSegmentOptions(values.segmentOptions) }
          : {}),
        ...(vectorConfigChanged
          ? {
              ...nextVectorConfig,
              vectorStoreConfigHash:
                buildVectorStoreConfigHash(nextVectorConfig),
              vectorStoreUpdatedAt: type === 'EXTERNAL' ? null : new Date(),
            }
          : {}),
      },
    );
    return this.bases.findById(id);
  }

  public async require(key: string): Promise<KnowledgeBaseEntity> {
    const base = await this.bases.findOne({ key });
    if (!base) throw new Error(`Knowledge base #${key} not found`);
    return base;
  }

  public async refreshStatistics(key: string): Promise<void> {
    const documents = await this.documents.find({
      filter: { knowledgeBaseKey: key },
    });
    await this.bases.update(
      { key },
      {
        documentCount: documents.length,
        characterCount: documents.reduce(
          (sum, item) => sum + Number(item.characterCount ?? 0),
          0,
        ),
      },
    );
  }

  public normalizeSegmentOptions(value: unknown): SegmentOptions {
    return normalizeSegmentOptions(value);
  }

  private requireKnowledgeBaseType(
    value: unknown,
  ): KnowledgeBaseEntity['knowledgeBaseType'] {
    const type = String(value ?? 'LOCAL');
    if (!['LOCAL', 'READONLY', 'EXTERNAL'].includes(type)) {
      throw new Error('Invalid knowledgeBaseType');
    }
    return type as KnowledgeBaseEntity['knowledgeBaseType'];
  }

  private resolveVectorStoreProvider(
    type: KnowledgeBaseEntity['knowledgeBaseType'],
    values: Record<string, unknown>,
    base?: KnowledgeBaseEntity,
  ): string {
    const builtIn =
      BUILT_IN_VECTOR_STORE_PROVIDERS[
        type as keyof typeof BUILT_IN_VECTOR_STORE_PROVIDERS
      ];
    if (builtIn) return builtIn;
    return String(
      values.vectorStoreProvider ??
        values.externalProvider ??
        (base?.knowledgeBaseType === 'EXTERNAL'
          ? base.vectorStoreProvider
          : ''),
    );
  }

  private validateVectorConfig(
    type: KnowledgeBaseEntity['knowledgeBaseType'],
    config: NormalizedKnowledgeBaseVectorConfig,
  ): void {
    if (type === 'EXTERNAL') return;
    for (const field of [
      'vectorDatabaseKey',
      'llmService',
      'embeddingModel',
    ] as const) {
      if (!config[field]) {
        throw new Error(`${field} is required for ${type} knowledge bases`);
      }
    }
  }

  private withoutManagedValues(
    values: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...values };
    for (const field of [
      'vectorDatabaseKey',
      'llmService',
      'embeddingModel',
      'vectorStoreConfigHash',
      'vectorStoreUpdatedAt',
      'externalProvider',
      'disk',
      'segmentOptions',
    ]) {
      delete result[field];
    }
    return result;
  }

  private requireAllowedStorageDisk(value: unknown): string {
    const disk =
      typeof value === 'string' && value.trim()
        ? value.trim()
        : this.allowedStorageDisks[0];
    if (!disk) throw new Error('No knowledge base storage disk is configured');
    if (!this.allowedStorageDisks.includes(disk)) {
      throw new Error(`Knowledge base storage disk "${disk}" is not allowed`);
    }
    return disk;
  }
}
