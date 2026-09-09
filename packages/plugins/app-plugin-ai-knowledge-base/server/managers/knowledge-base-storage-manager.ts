import { createHash } from 'node:crypto';

import {
  FileMetadataPersistenceError,
  type FileMetadata,
  type OpenedFile,
  type FileStorage,
  type FileStorageFactory,
  type WriteFileInput,
} from '@nocobase/ai-employee';

import {
  KnowledgeBaseDocumentMetadataRepository,
  type KnowledgeBaseDocumentMetadataCreateContext,
  mapKnowledgeBaseDocumentMetadata,
  KnowledgeBaseSegmentShardMetadataRepository,
  mapKnowledgeBaseSegmentShardMetadata,
  type KnowledgeBaseSegmentShardMetadataCreateContext,
} from '../file-storage/index.js';
import type {
  KnowledgeBaseDocumentEntity,
  KnowledgeBaseDocumentRepository,
  KnowledgeBaseEntity,
  KnowledgeBaseSegmentShardEntity,
  KnowledgeBaseSegmentShardRepository,
} from '../repository/index.js';

import type { KnowledgeBaseWarningLogger } from '../internal-types.js';

const defaultWarningLogger: KnowledgeBaseWarningLogger = {
  warn(message, details): void {
    console.warn(message, details);
  },
};

export class KnowledgeBaseStorageManager {
  public constructor(
    private readonly fileStorageFactory: FileStorageFactory,
    private readonly documents: KnowledgeBaseDocumentRepository,
    private readonly segmentShards: KnowledgeBaseSegmentShardRepository,
    private readonly allowedStorageDisks: readonly string[],
    private readonly warningLogger: KnowledgeBaseWarningLogger = defaultWarningLogger,
  ) {}

  public createDocumentStorage(
    base: KnowledgeBaseEntity,
  ): FileStorage<
    KnowledgeBaseDocumentEntity,
    KnowledgeBaseDocumentMetadataCreateContext
  > {
    if (!base.disk || !this.allowedStorageDisks.includes(base.disk)) {
      throw new Error(
        `Knowledge base "${base.key}" has no available storage disk.`,
      );
    }
    return this.fileStorageFactory.create({
      disk: base.disk,
      prefix: `ai-knowledge-base/${base.key}/documents`,
      metadataRepository: new KnowledgeBaseDocumentMetadataRepository(
        this.documents,
      ),
    });
  }

  public async writeDocument(
    base: KnowledgeBaseEntity,
    input: WriteFileInput<KnowledgeBaseDocumentMetadataCreateContext>,
  ): Promise<FileMetadata<KnowledgeBaseDocumentEntity>> {
    const storage = this.createDocumentStorage(base);
    try {
      return await storage.write(input);
    } catch (cause) {
      if (cause instanceof FileMetadataPersistenceError) {
        try {
          if (!storage.deleteObject) {
            throw new Error('File storage does not support object deletion.', {
              cause,
            });
          }
          await storage.deleteObject(cause.metadata.key);
        } catch (cleanupError) {
          this.warningLogger.warn(
            'Knowledge base document object cleanup failed after metadata persistence failure.',
            {
              disk: cause.metadata.disk,
              path: cause.metadata.key,
              error: cleanupError,
            },
          );
        }
      }
      throw cause;
    }
  }

  public openDocument(
    document: KnowledgeBaseDocumentEntity,
  ): Promise<OpenedFile<KnowledgeBaseDocumentEntity>> {
    const storage = this.fileStorageFactory.create({
      disk: document.disk,
      prefix: '',
      metadataRepository: new KnowledgeBaseDocumentMetadataRepository(
        this.documents,
      ),
    });
    return storage.openMetadata(mapKnowledgeBaseDocumentMetadata(document));
  }

  public createSegmentShardStorage(
    base: KnowledgeBaseEntity,
  ): FileStorage<
    KnowledgeBaseSegmentShardEntity,
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
    base: KnowledgeBaseEntity,
    shard: KnowledgeBaseSegmentShardEntity,
  ): Promise<Record<string, Record<string, unknown>>> {
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
    ) as Record<string, unknown>;
    const storedSegments = this.jsonRecord(payload.segments) as Record<
      string,
      Record<string, unknown>
    >;
    const persistedSegments = this.jsonRecord(shard.meta.segments) as Record<
      string,
      Record<string, unknown>
    >;
    return { ...storedSegments, ...persistedSegments };
  }
  public async deleteDocumentObject(
    document: KnowledgeBaseDocumentEntity,
  ): Promise<void> {
    const storage = this.fileStorageFactory.create({
      disk: document.disk,
      prefix: '',
      metadataRepository: new KnowledgeBaseDocumentMetadataRepository(
        this.documents,
      ),
    });
    if (!storage.deleteObject) {
      throw new Error('File storage does not support object deletion.');
    }
    await storage.deleteObject(document.path);
  }
  public async replaceDocumentObject(
    document: KnowledgeBaseDocumentEntity,
    content: Uint8Array,
    mimeType?: string,
  ): Promise<void> {
    const storage = this.fileStorageFactory.create({
      disk: document.disk,
      prefix: '',
      metadataRepository: new KnowledgeBaseDocumentMetadataRepository(
        this.documents,
      ),
    });
    if (!storage.replaceObject) {
      throw new Error('File storage does not support object replacement.');
    }
    await storage.replaceObject({
      key: document.path,
      content,
      mimeType,
    });
  }

  public async deleteSegmentShardObject(
    shard: KnowledgeBaseSegmentShardEntity,
  ): Promise<void> {
    const storage = this.fileStorageFactory.create({
      disk: shard.disk,
      prefix: '',
      metadataRepository: new KnowledgeBaseSegmentShardMetadataRepository(
        this.segmentShards,
      ),
    });
    if (!storage.deleteObject) {
      throw new Error('File storage does not support object deletion.');
    }
    await storage.deleteObject(shard.path);
  }

  public async replaceShardContents(
    shard: KnowledgeBaseSegmentShardEntity,
    contents: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    const storage = this.fileStorageFactory.create({
      disk: shard.disk,
      prefix: '',
      metadataRepository: new KnowledgeBaseSegmentShardMetadataRepository(
        this.segmentShards,
      ),
    });
    if (!storage.replaceObject) {
      throw new Error('File storage does not support object replacement.');
    }
    const payload = JSON.stringify({
      schemaVersion: 1,
      knowledgeBaseKey: shard.knowledgeBaseKey,
      knowledgeBaseDocsId: shard.knowledgeBaseDocsId,
      segmentVersion: shard.segmentVersion,
      shardNo: shard.shardNo,
      segments: contents,
    });
    await storage.replaceObject({
      key: shard.path,
      content: Buffer.from(payload),
      mimeType: 'application/json',
    });
    await this.segmentShards.update(
      { id: shard.id },
      {
        segmentCount: Object.keys(contents).length,
        contentHash: createHash('sha256').update(payload).digest('hex'),
        meta: { ...shard.meta, segments: {} },
      },
    );
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

  private jsonRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
