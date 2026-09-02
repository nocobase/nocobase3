import type {
  FileMetadata,
  FileMetadataId,
  FileMetadataRepository,
  NewFileMetadata,
} from '@nocobase/ai-employee';

import type { AIFileEntity, AIFileRepository } from '../repository/ai-file.js';

export interface AIFileMetadataCreateContext {
  readonly createdById: string | number;
  readonly createdAt?: Date;
}

export class AIFileMetadataRepository implements FileMetadataRepository<
  AIFileEntity,
  AIFileMetadataCreateContext
> {
  public constructor(private readonly repository: AIFileRepository) {}

  public async create(
    metadata: NewFileMetadata,
    context: AIFileMetadataCreateContext,
  ): Promise<FileMetadata<AIFileEntity>> {
    const entity = await this.repository.create({
      values: {
        id: metadata.id,
        disk: metadata.disk,
        path: metadata.key,
        filename: metadata.filename,
        extname: metadata.extname,
        size: metadata.size,
        mimetype: metadata.mimeType,
        url: metadata.url,
        createdById: context.createdById,
        createdAt: context.createdAt ?? new Date(),
      },
    });
    return mapAIFileMetadata(entity);
  }

  public async findById(
    id: FileMetadataId,
  ): Promise<FileMetadata<AIFileEntity> | null> {
    const entity = await this.repository.findOne({ filter: { id } });
    return entity ? mapAIFileMetadata(entity) : null;
  }
}

export function mapAIFileMetadata(
  entity: AIFileEntity,
): FileMetadata<AIFileEntity> {
  if (entity.id == null) throw new Error('AI file metadata has no id.');
  if (!entity.disk)
    throw new Error(`AI file "${String(entity.id)}" has no disk.`);
  if (!entity.path)
    throw new Error(`AI file "${String(entity.id)}" has no path.`);
  return {
    id: normalizeMetadataId(entity.id),
    disk: entity.disk,
    key: entity.path,
    filename: entity.filename ?? 'file',
    extname: entity.extname ?? '',
    size: entity.size ?? 0,
    mimeType: entity.mimetype ?? 'application/octet-stream',
    url: entity.url,
    entity,
  };
}

function normalizeMetadataId(id: string | number | bigint): FileMetadataId {
  return typeof id === 'bigint' ? id.toString() : id;
}
