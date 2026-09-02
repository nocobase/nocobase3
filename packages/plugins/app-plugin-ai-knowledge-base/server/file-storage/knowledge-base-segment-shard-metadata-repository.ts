import type {
  FileMetadata,
  FileMetadataId,
  FileMetadataRepository,
  NewFileMetadata,
} from '@nocobase/ai-employee';

import type { TableRepository } from '../repository.js';
import type { JsonRecord, SegmentShardRecord } from '../types.js';

export interface KnowledgeBaseSegmentShardMetadataCreateContext {
  readonly knowledgeBaseKey: string;
  readonly knowledgeBaseDocsId: string | number;
  readonly shardNo: number;
  readonly segmentVersion: number;
  readonly segmentCount: number;
  readonly contentHash: string;
  readonly meta?: JsonRecord;
  readonly createdById?: string | number;
}

export function mapKnowledgeBaseSegmentShardMetadata(
  entity: SegmentShardRecord,
): FileMetadata<SegmentShardRecord> {
  return {
    id: entity.id,
    disk: entity.disk,
    key: entity.path,
    filename: entity.filename,
    extname: entity.extname ?? '',
    size: Number(entity.size ?? 0),
    mimeType: entity.mimetype ?? 'application/json',
    ...(entity.url ? { url: entity.url } : {}),
    entity,
  };
}

export class KnowledgeBaseSegmentShardMetadataRepository implements FileMetadataRepository<
  SegmentShardRecord,
  KnowledgeBaseSegmentShardMetadataCreateContext
> {
  public constructor(
    private readonly repository: TableRepository<SegmentShardRecord>,
  ) {}

  public async create(
    metadata: NewFileMetadata,
    context: KnowledgeBaseSegmentShardMetadataCreateContext,
  ): Promise<FileMetadata<SegmentShardRecord>> {
    const entity = await this.repository.create(
      {
        ...(metadata.id !== undefined ? { id: metadata.id } : {}),
        knowledgeBaseKey: context.knowledgeBaseKey,
        knowledgeBaseDocsId: context.knowledgeBaseDocsId,
        shardNo: context.shardNo,
        segmentVersion: context.segmentVersion,
        segmentCount: context.segmentCount,
        contentHash: context.contentHash,
        filename: metadata.filename,
        extname: metadata.extname,
        path: metadata.key,
        ...(metadata.url ? { url: metadata.url } : {}),
        size: metadata.size,
        mimetype: metadata.mimeType,
        disk: metadata.disk,
        meta: context.meta ?? {},
        createdById: context.createdById,
      },
      {
        knowledgeBaseDocsId: context.knowledgeBaseDocsId,
        segmentVersion: context.segmentVersion,
        shardNo: context.shardNo,
      },
    );

    return mapKnowledgeBaseSegmentShardMetadata(entity);
  }

  public async findById(
    id: FileMetadataId,
  ): Promise<FileMetadata<SegmentShardRecord> | null> {
    const entity = await this.repository.findById(id);
    return entity ? mapKnowledgeBaseSegmentShardMetadata(entity) : null;
  }
}
