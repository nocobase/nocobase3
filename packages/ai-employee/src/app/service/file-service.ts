import { Buffer } from 'node:buffer';
import path from 'node:path';
import type { SnowflakeIdGenerator } from '@nocobase/id-generator';
import type { Context } from '../context.js';
import type { FileManager } from '../../manager/file/index.js';

type UploadResult = {
  id: number | string;
  filename: string;
  size: number;
  mimetype?: string;
  extname?: string;
  url?: string;
  preview?: string;
  storageId?: number;
  data?: Record<string, unknown>;
  source: { collectionName: 'aiFiles' };
};

/** `aiFiles` service backed by the configured FileManager. */
export class AIFileService {
  constructor(
    private readonly fileManager: FileManager,
    private readonly snowflake: SnowflakeIdGenerator,
    private readonly apiBasePath: string,
  ) {}

  private async saveFile(
    ctx: Context,
    file: File,
    storageId: number,
  ): Promise<UploadResult> {
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = path.basename(file.name || 'file');
    const extname = path.extname(filename).toLowerCase();
    const id = this.snowflake.generate();
    const stored = await this.fileManager.put(
      String(id),
      buffer,
      filename,
      file.type || undefined,
    );

    const repo = ctx.repositories.aiFiles;
    const previewUrl = this.createPreviewUrl(id);
    const values = {
      id: String(id),
      filename,
      size: buffer.length,
      mimetype: file.type || 'application/octet-stream',
      extname,
      path: stored.key,
      storageId,
      createdById: ctx.currentUser.id,
      createdAt: new Date(),
    };
    try {
      const record = await ctx.database.transaction((connection) =>
        repo.create({ values }, { connection }),
      );
      return {
        id: String(record.id ?? id),
        filename,
        size: buffer.length,
        mimetype: record.mimetype,
        extname,
        url: previewUrl,
        preview: previewUrl,
        source: { collectionName: 'aiFiles' },
        storageId,
        data: {
          ...record,
          url: previewUrl,
          preview: previewUrl,
          source: { collectionName: 'aiFiles' },
        },
      };
    } catch (error) {
      await this.fileManager.delete(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async create(ctx: Context, file: File): Promise<UploadResult> {
    const repo = ctx.repositories.aiFiles;
    const indexRow = await repo.find({
      filter: { createdById: ctx.currentUser.id },
      sort: ['-id'],
      limit: 1,
    });
    const storageId = Number(indexRow[0]?.storageId ?? 1);
    return this.saveFile(ctx, file, storageId);
  }

  private createPreviewUrl(id: string | number): string {
    return `${this.apiBasePath}/aiFiles:preview?filterByTk=${id}`;
  }

  async preview(ctx: Context, id: string): Promise<Response> {
    const repo = ctx.repositories.aiFiles;
    const record = await repo.findOne({ filter: { id } });
    if (!record) return new Response('file not found', { status: 404 });
    if (
      record.createdById != null &&
      String(record.createdById) !== String(ctx.currentUser.id) &&
      !ctx.currentUser.isRoot
    ) {
      return new Response('forbidden', { status: 403 });
    }

    const key = record.path || String(id);
    try {
      const bytes = await this.fileManager.getBytes(key);
      return new Response(Buffer.from(bytes), {
        headers: {
          'Content-Type': record.mimetype ?? 'application/octet-stream',
          'Content-Disposition': `inline; filename="${encodeURIComponent(record.filename ?? 'file')}"`,
        },
      });
    } catch {
      return new Response('file content not found', { status: 404 });
    }
  }
}
