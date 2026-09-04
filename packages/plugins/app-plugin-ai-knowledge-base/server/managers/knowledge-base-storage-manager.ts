import type { FileStorage, FileStorageFactory } from '@nocobase/ai-employee';

import {
  KnowledgeBaseDocumentMetadataRepository,
  type KnowledgeBaseDocumentMetadataCreateContext,
  KnowledgeBaseSegmentShardMetadataRepository,
  mapKnowledgeBaseSegmentShardMetadata,
  type KnowledgeBaseSegmentShardMetadataCreateContext,
} from '../file-storage/index.js';
import type {
  JsonRecord,
  KnowledgeBaseDocumentRecord,
  KnowledgeBaseRecord,
  SegmentShardRecord,
} from '../internal-types.js';
import type { TableRepository } from '../repositories/table-repository.js';

export class KnowledgeBaseStorageManager {
  public constructor(
    private readonly fileStorageFactory: FileStorageFactory,
    private readonly documents: TableRepository<KnowledgeBaseDocumentRecord>,
    private readonly segmentShards: TableRepository<SegmentShardRecord>,
    private readonly allowedStorageDisks: readonly string[],
  ) {}

  public createDocumentStorage(
    base: KnowledgeBaseRecord,
  ): FileStorage<
    KnowledgeBaseDocumentRecord,
    KnowledgeBaseDocumentMetadataCreateContext
  > {
    if (!base.disk) {
      throw new Error(`Knowledge base "${base.key}" has no storage disk.`);
    }
    return this.fileStorageFactory.create({
      disk: base.disk,
      prefix: `ai-knowledge-base/${base.key}/documents`,
      metadataRepository: new KnowledgeBaseDocumentMetadataRepository(
        this.documents,
      ),
    });
  }

  public createSegmentShardStorage(
    base: KnowledgeBaseRecord,
  ): FileStorage<
    SegmentShardRecord,
    KnowledgeBaseSegmentShardMetadataCreateContext
  > {
    if (!base.disk) {
      throw new Error(`Knowledge base "${base.key}" has no storage disk.`);
    }
    return this.fileStorageFactory.create({
      disk: base.disk,
      prefix: `ai-knowledge-base/${base.key}/segment-shards`,
      metadataRepository: new KnowledgeBaseSegmentShardMetadataRepository(
        this.segmentShards,
      ),
    });
  }

  public async readShardContents(
    base: KnowledgeBaseRecord,
    shard: SegmentShardRecord,
  ): Promise<Record<string, JsonRecord>> {
    const storage = this.createSegmentShardStorage(base);
    const opened = await storage.openMetadata(
      mapKnowledgeBaseSegmentShardMetadata(shard),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of opened.stream as AsyncIterable<
      Uint8Array | string
    >) {
      chunks.push(
        typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk),
      );
    }
    const payload = JSON.parse(
      Buffer.concat(chunks).toString('utf8'),
    ) as JsonRecord;
    const storedSegments = this.jsonRecord(payload.segments) as Record<
      string,
      JsonRecord
    >;
    const persistedSegments = this.jsonRecord(shard.meta.segments) as Record<
      string,
      JsonRecord
    >;
    return { ...storedSegments, ...persistedSegments };
  }

  public requireAllowedStorageDisk(value: unknown): string {
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

  private jsonRecord(value: unknown): JsonRecord {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonRecord)
      : {};
  }
}
