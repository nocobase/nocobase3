import { Readable } from 'node:stream';

import type { FileMetadata, FileStorage } from '@nocobase/ai-employee';
import type { IdGeneratorService } from '@nocobase/snowflake';

import type { Actor } from '../domain/contracts.js';
import { forbiddenError, notFoundError } from '../domain/errors.js';
import type { AIFileMetadataCreateContext } from '../file-storage/ai-file-metadata-repository.js';
import type { AIFileEntity } from '../repository/ai-file.js';

export type AIFileUploadResult = {
  id: number | string;
  filename: string;
  size: number;
  mimetype: string;
  extname: string;
  disk: string;
  path: string;
  url?: string;
  preview: string;
  data: Record<string, unknown>;
  source: { collectionName: 'aiFiles' };
};

export interface AIFilePreviewResult {
  readonly stream: ReadableStream<Uint8Array>;
  readonly contentType: string;
  readonly filename: string;
}

/** `aiFiles` domain service backed by metadata-aware file storage. */
export interface AIFileServiceOptions {
  readonly fileStorage: FileStorage<AIFileEntity, AIFileMetadataCreateContext>;
  readonly snowflake: IdGeneratorService;
  readonly apiBasePath: string;
}

export class AIFileService {
  private readonly fileStorage: FileStorage<
    AIFileEntity,
    AIFileMetadataCreateContext
  >;
  private readonly snowflake: IdGeneratorService;
  private readonly apiBasePath: string;

  public constructor({
    fileStorage,
    snowflake,
    apiBasePath,
  }: AIFileServiceOptions) {
    this.fileStorage = fileStorage;
    this.snowflake = snowflake;
    this.apiBasePath = apiBasePath;
  }

  public async create({
    actor,
    file,
  }: {
    actor: Actor;
    file: File;
  }): Promise<AIFileUploadResult> {
    const id = String(this.snowflake.generate());
    const metadata = await this.fileStorage.write({
      id,
      objectId: id,
      filename: file.name || 'file',
      content: file.stream(),
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      metadataContext: { createdById: actor.id },
    });
    return this.toUploadResult(metadata);
  }

  public async preview({
    actor,
    id,
  }: {
    actor: Actor;
    id: string;
  }): Promise<AIFilePreviewResult> {
    let opened;
    try {
      opened = await this.fileStorage.open(id);
    } catch {
      throw notFoundError('file content not found');
    }
    if (!opened) throw notFoundError('file not found');

    const record = opened.metadata.entity;
    if (
      record.createdById != null &&
      String(record.createdById) !== String(actor.id) &&
      !actor.isRoot
    ) {
      throw forbiddenError('forbidden');
    }

    return {
      stream: Readable.toWeb(
        opened.stream as Readable,
      ) as ReadableStream<Uint8Array>,
      contentType: opened.contentType,
      filename: opened.metadata.filename,
    };
  }

  private createPreviewUrl(id: string | number): string {
    return `${this.apiBasePath}/aiFiles:preview?id=${id}`;
  }

  private toUploadResult(
    metadata: FileMetadata<AIFileEntity>,
  ): AIFileUploadResult {
    const preview = this.createPreviewUrl(metadata.id);
    return {
      id: metadata.id,
      filename: metadata.filename,
      size: metadata.size,
      mimetype: metadata.mimeType,
      extname: metadata.extname,
      disk: metadata.disk,
      path: metadata.key,
      url: preview,
      preview,
      source: { collectionName: 'aiFiles' },
      data: {
        ...metadata.entity,
        url: preview,
        preview,
        source: { collectionName: 'aiFiles' },
      },
    };
  }
}
