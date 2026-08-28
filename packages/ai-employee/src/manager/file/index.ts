import { Readable } from 'node:stream';
import type { AIFileAttachment } from '../../types/ai-file-attachment.js';
export interface DriveDisk {
  put(
    key: string,
    buffer: Uint8Array,
    options?: { contentType?: string },
  ): Promise<void>;
  getStream(key: string): Promise<NodeJS.ReadableStream>;
  getBytes(key: string): Promise<Uint8Array>;
  getUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}

export interface DriveManager {
  use(name?: string): DriveDisk;
}

export interface ManagedFile {
  key: string;
  filename: string;
  size: number;
  mimetype?: string;
  url?: string;
}

export abstract class FileManager {
  abstract put(
    id: string,
    buffer: Uint8Array,
    filename: string,
    mimetype?: string,
  ): Promise<ManagedFile>;
  abstract getFileStream(
    file: AIFileAttachment,
    options?: Record<string, unknown>,
  ): Promise<{ stream: NodeJS.ReadableStream; contentType?: string }>;
  abstract getBytes(key: string): Promise<Uint8Array>;
  abstract getUrl(key: string): Promise<string | undefined>;
  abstract delete(key: string): Promise<void>;
}

/** Persists AI files through the application's configured NocoBase drive. */
export class DriveFileManager extends FileManager {
  private readonly disk: DriveDisk;

  constructor(
    drive: DriveManager,
    diskName?: string,
    private readonly prefix = 'ai-files',
  ) {
    super();
    this.disk = drive.use(diskName);
  }

  async put(
    id: string,
    buffer: Uint8Array,
    filename: string,
    mimetype?: string,
  ): Promise<ManagedFile> {
    const key = this.createKey(id, filename);
    await this.disk.put(key, buffer, {
      contentType: mimetype || undefined,
    });
    return {
      key,
      filename,
      size: buffer.byteLength,
      mimetype,
      url: await this.getUrl(key),
    };
  }

  async getFileStream(
    file: AIFileAttachment,
  ): Promise<{ stream: NodeJS.ReadableStream; contentType?: string }> {
    const key = resolveFileKey(file);
    if (!key) {
      return {
        stream: Readable.from([]),
        contentType: file.mimetype ?? 'application/octet-stream',
      };
    }
    const stream = await this.disk.getStream(key);
    return {
      stream,
      contentType: file.mimetype,
    };
  }

  async getBytes(key: string): Promise<Uint8Array> {
    return this.disk.getBytes(key);
  }

  async getUrl(key: string): Promise<string | undefined> {
    try {
      return await this.disk.getUrl(key);
    } catch {
      return undefined;
    }
  }

  async delete(key: string): Promise<void> {
    await this.disk.delete(key);
  }

  private createKey(id: string, filename: string): string {
    return `${this.prefix}/${id}-${normalizeFilename(filename)}`;
  }
}

/** In-memory implementation retained for isolated consumers and tests. */
export class MemoryFileManager extends FileManager {
  private readonly files = new Map<
    string,
    { buffer: Buffer; filename: string; mimetype?: string }
  >();

  async put(
    id: string,
    buffer: Uint8Array,
    filename: string,
    mimetype?: string,
  ): Promise<ManagedFile> {
    this.files.set(id, {
      buffer: Buffer.from(buffer),
      filename,
      mimetype,
    });
    return {
      key: id,
      filename,
      size: buffer.byteLength,
      mimetype,
      url: undefined,
    };
  }

  async getFileStream(
    file: AIFileAttachment,
  ): Promise<{ stream: NodeJS.ReadableStream; contentType?: string }> {
    const id = String(file.id ?? file.storageId ?? '');
    const stored = this.files.get(id);
    return {
      stream: Readable.from(stored?.buffer ?? []),
      contentType: stored?.mimetype ?? file.mimetype,
    };
  }

  async getBytes(key: string): Promise<Uint8Array> {
    const stored = this.files.get(key);
    if (!stored) throw new Error(`File "${key}" does not exist.`);
    return stored.buffer;
  }

  async getUrl(): Promise<string | undefined> {
    return undefined;
  }

  async delete(id: string): Promise<void> {
    this.files.delete(id);
  }
}

function resolveFileKey(file: AIFileAttachment): string | undefined {
  if (typeof file.path === 'string' && file.path) return file.path;
  if (typeof file.meta?.key === 'string' && file.meta.key) return file.meta.key;
  if (typeof file.id === 'string' && file.id.includes('/')) return file.id;
  return undefined;
}

function normalizeFilename(filename: string): string {
  const basename = filename.split(/[/\\]/).pop()?.trim() || 'file';
  return (
    basename
      .replace(/[^\w. -]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 128) || 'file'
  );
}
