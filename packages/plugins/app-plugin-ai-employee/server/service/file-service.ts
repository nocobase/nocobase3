import { Readable } from 'node:stream';

import type { FileStorage, FileMetadata } from '@nocobase/ai-employee';
import type { IdGeneratorService } from '@nocobase/snowflake';

import type { Context } from '../context.js';
import type { AIFileEntity } from '../repository/ai-file.js';
import type { AIFileMetadataCreateContext } from '../file-storage/ai-file-metadata-repository.js';

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

/** `aiFiles` service backed by metadata-aware file storage. */
export class AIFileService {
  public constructor(
    private readonly fileStorage: FileStorage<
      AIFileEntity,
      AIFileMetadataCreateContext
    >,
    private readonly snowflake: IdGeneratorService,
    private readonly apiBasePath: string,
  ) {}

  public async create(ctx: Context, file: File): Promise<AIFileUploadResult> {
    const id = String(this.snowflake.generate());
    const metadata = await this.fileStorage.write({
      id,
      objectId: id,
      filename: file.name || 'file',
      content: file.stream(),
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      metadataContext: { createdById: ctx.currentUser.id },
    });
    return this.toUploadResult(metadata);
  }

  public async preview(ctx: Context, id: string): Promise<Response> {
    let opened;
    try {
      opened = await this.fileStorage.open(id);
    } catch {
      return new Response('file content not found', { status: 404 });
    }
    if (!opened) return new Response('file not found', { status: 404 });

    const record = opened.metadata.entity;
    if (
      record.createdById != null &&
      String(record.createdById) !== String(ctx.currentUser.id) &&
      !ctx.currentUser.isRoot
    ) {
      return new Response('forbidden', { status: 403 });
    }

    return new Response(
      Readable.toWeb(opened.stream as Readable) as ReadableStream<Uint8Array>,
      {
        headers: {
          'Content-Type': opened.contentType,
          'Content-Disposition': `inline; filename="${encodeURIComponent(opened.metadata.filename)}"`,
        },
      },
    );
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
