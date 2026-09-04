import { nanoid } from 'nanoid';

import type {
  JsonRecord,
  KnowledgeBaseDocumentRecord,
  KnowledgeBaseRecord,
  SegmentOptions,
  VectorStoreConfigRecord,
} from '../internal-types.js';
import type { TableRepository } from '../repositories/table-repository.js';
import { normalizeSegmentOptions } from './segment-options.js';

export class KnowledgeBaseManager {
  public constructor(
    private readonly bases: TableRepository<KnowledgeBaseRecord>,
    private readonly documents: TableRepository<KnowledgeBaseDocumentRecord>,
    private readonly vectorStoreConfigs: TableRepository<VectorStoreConfigRecord>,
    private readonly allowedStorageDisks: readonly string[],
  ) {}

  public async create(values: JsonRecord): Promise<KnowledgeBaseRecord> {
    const type = String(values.knowledgeBaseType ?? 'LOCAL');
    if (!['LOCAL', 'READONLY', 'EXTERNAL'].includes(type)) {
      throw new Error('Invalid knowledgeBaseType');
    }
    const vectorStoreConfigKey = String(
      values.vectorStoreConfigKey ?? nanoid(32),
    );
    if (
      type !== 'EXTERNAL' &&
      (values.llmService ||
        values.embeddingModel ||
        values.vectorDatabaseKey ||
        values.vectorStoreConfigKey)
    ) {
      await this.vectorStoreConfigs.create({
        key: vectorStoreConfigKey,
        name: `${String(values.name ?? 'Knowledge base')} vector store`,
        vectorDatabaseKey: String(
          values.vectorDatabaseKey ?? values.vectorStoreConfigKey ?? '',
        ),
        llmService: String(values.llmService ?? ''),
        embeddingModel: String(values.embeddingModel ?? ''),
        enabled: true,
      });
    }
    const disk = this.requireAllowedStorageDisk(values.disk);
    const {
      llmService: _llmService,
      embeddingModel: _embeddingModel,
      vectorDatabaseKey: _vectorDatabaseKey,
      externalProvider: _externalProvider,
      disk: _disk,
      ...baseValues
    } = values;
    return this.bases.create({
      ...baseValues,
      vectorStoreConfigKey,
      disk,
      key: String(values.key ?? nanoid(32)),
      knowledgeBaseType: type as KnowledgeBaseRecord['knowledgeBaseType'],
      knowledgeBaseOuterId: String(values.knowledgeBaseOuterId ?? nanoid(32)),
      vectorStoreProvider: String(
        values.vectorStoreProvider ??
          (type === 'LOCAL'
            ? 'NocobaseLocalVectorStoreProvider'
            : type === 'READONLY'
              ? 'NocobaseReadonlyVectorStoreProvider'
              : String(values.externalProvider ?? '')),
      ),
      segmentOptions: normalizeSegmentOptions(values.segmentOptions),
      enabled: values.enabled !== false,
      documentCount: 0,
      characterCount: 0,
      aiEmployeeCount: 0,
      confirmVectorStoreChanged: new Date(),
    });
  }

  public async update(
    id: string | number,
    values: JsonRecord,
  ): Promise<KnowledgeBaseRecord | null> {
    const base = await this.bases.findById(id);
    if (!base) return null;
    const configValues: Partial<VectorStoreConfigRecord> = {};
    if (values.llmService !== undefined) {
      configValues.llmService = String(values.llmService);
    }
    if (values.embeddingModel !== undefined) {
      configValues.embeddingModel = String(values.embeddingModel);
    }
    if (
      values.vectorDatabaseKey !== undefined ||
      values.vectorStoreConfigKey !== undefined
    ) {
      configValues.vectorDatabaseKey = String(
        values.vectorDatabaseKey ?? values.vectorStoreConfigKey,
      );
    }
    if (Object.keys(configValues).length) {
      const existing = await this.vectorStoreConfigs.findOne({
        key: base.vectorStoreConfigKey,
      });
      if (existing) {
        await this.vectorStoreConfigs.update({ id: existing.id }, configValues);
      } else {
        await this.vectorStoreConfigs.create({
          key: base.vectorStoreConfigKey ?? nanoid(32),
          name: `${base.name} vector store`,
          embeddingModel: String(configValues.embeddingModel ?? ''),
          enabled: true,
          ...configValues,
        });
      }
    }
    const disk =
      values.disk === undefined
        ? undefined
        : this.requireAllowedStorageDisk(values.disk);
    const {
      llmService: _llmService,
      embeddingModel: _embeddingModel,
      vectorDatabaseKey: _vectorDatabaseKey,
      disk: _disk,
      ...baseValues
    } = values;
    await this.bases.update(
      { id },
      {
        ...baseValues,
        ...(disk ? { disk } : {}),
        segmentOptions: values.segmentOptions
          ? normalizeSegmentOptions(values.segmentOptions)
          : undefined,
      },
    );
    return this.bases.findById(id);
  }

  public async require(key: string): Promise<KnowledgeBaseRecord> {
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
