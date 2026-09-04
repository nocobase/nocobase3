import type {
  FileMetadata,
  FileMetadataId,
  FileMetadataRepository,
  NewFileMetadata,
} from '@nocobase/ai-employee';

import type { TableRepository } from '../repositories/table-repository.js';
import type {
  KnowledgeBaseDocumentRecord,
  SegmentOptions,
} from '../internal-types.js';

export interface KnowledgeBaseDocumentMetadataCreateContext {
  readonly key: string;
  readonly knowledgeBaseKey: string;
  readonly title: string;
  readonly segmentOptions: SegmentOptions;
  readonly createdById?: string | number;
}

export function mapKnowledgeBaseDocumentMetadata(
  entity: KnowledgeBaseDocumentRecord,
): FileMetadata<KnowledgeBaseDocumentRecord> {
  return {
    id: entity.id,
    disk: entity.disk,
    key: entity.path,
    filename: entity.filename ?? entity.title ?? 'file',
    extname: entity.extname ?? '',
    size: Number(entity.size ?? 0),
    mimeType: entity.mimetype ?? 'application/octet-stream',
    ...(entity.url ? { url: entity.url } : {}),
    entity,
  };
}

export class KnowledgeBaseDocumentMetadataRepository implements FileMetadataRepository<
  KnowledgeBaseDocumentRecord,
  KnowledgeBaseDocumentMetadataCreateContext
> {
  public constructor(
    private readonly repository: TableRepository<KnowledgeBaseDocumentRecord>,
  ) {}

  public async create(
    metadata: NewFileMetadata,
    context: KnowledgeBaseDocumentMetadataCreateContext,
  ): Promise<FileMetadata<KnowledgeBaseDocumentRecord>> {
    const entity = await this.repository.create({
      ...(metadata.id !== undefined ? { id: metadata.id } : {}),
      key: context.key,
      title: context.title,
      filename: metadata.filename,
      extname: metadata.extname,
      size: metadata.size,
      mimetype: metadata.mimeType,
      disk: metadata.disk,
      path: metadata.key,
      ...(metadata.url ? { url: metadata.url } : {}),
      meta: {},
      knowledgeBaseKey: context.knowledgeBaseKey,
      indexStatus: 'PENDING',
      errorMessage: null,
      characterCount: 0,
      segmentCount: 0,
      segmentVersion: 0,
      segmentRevision: 0,
      segmentStatus: 'PENDING',
      segmentErrorMessage: null,
      segmentOptions: context.segmentOptions,
      enabled: true,
      createdById: context.createdById,
    });

    return mapKnowledgeBaseDocumentMetadata(entity);
  }

  public async findById(
    id: FileMetadataId,
  ): Promise<FileMetadata<KnowledgeBaseDocumentRecord> | null> {
    const entity = await this.repository.findById(id);
    return entity ? mapKnowledgeBaseDocumentMetadata(entity) : null;
  }
}
