import { Readable } from 'node:stream';

import type {
  FileMetadata,
  FileMetadataRepository,
  FileStorage,
} from '@nocobase/ai-employee';
import type { IdGeneratorService } from '@nocobase/snowflake';

import type { Actor } from '../types.js';
import { forbiddenError, notFoundError } from '../types.js';
import type { AIFileMetadataCreateContext } from '../repository/file-storage/ai-file-metadata-repository.js';
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
  /** The records behind `fileStorage`, read to authorize before any content is opened. */
  readonly fileMetadata: FileMetadataRepository<
    AIFileEntity,
    AIFileMetadataCreateContext
  >;
  readonly snowflake: IdGeneratorService;
  readonly apiBasePath: string;
}

export class AIFileService {
  private readonly fileStorage: FileStorage<
    AIFileEntity,
    AIFileMetadataCreateContext
  >;
  private readonly fileMetadata: FileMetadataRepository<
    AIFileEntity,
    AIFileMetadataCreateContext
  >;
  private readonly snowflake: IdGeneratorService;
  private readonly apiBasePath: string;

  public constructor({
    fileStorage,
    fileMetadata,
    snowflake,
    apiBasePath,
  }: AIFileServiceOptions) {
    this.fileStorage = fileStorage;
    this.fileMetadata = fileMetadata;
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
    canReadAnyFile,
  }: {
    actor: Actor;
    id: string;
    /** Whether this caller may read files others uploaded; asked only when needed. */
    canReadAnyFile?: () => Promise<boolean>;
  }): Promise<AIFilePreviewResult> {
    const metadata = await this.fileMetadata.findById(id);
    if (!metadata) throw notFoundError('file not found');

    const record = metadata.entity;
    // Only the uploader reads a file by default. Anyone else — including for a
    // file that records no uploader — needs what the conversation center needs,
    // never a role name or root flag carried on the session. Decided before the
    // content is opened, so a refused request reads nothing from storage.
    const ownFile =
      record.createdById != null &&
      String(record.createdById) === String(actor.id);
    if (!ownFile && !(await canReadAnyFile?.())) {
      throw forbiddenError('forbidden');
    }

    let opened;
    try {
      opened = await this.fileStorage.openMetadata(metadata);
    } catch {
      throw notFoundError('file content not found');
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
    return aiFilePreviewUrl(this.apiBasePath, id);
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

/** Where an `aiFiles` attachment is read back, relative to the AI API. */
export function aiFilePreviewUrl(
  apiBasePath: string,
  id: string | number,
): string {
  return `${apiBasePath}/aiFiles:preview?id=${id}`;
}

type HistoryMessage = {
  content?: {
    attachments?: unknown;
    subAgentConversations?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * Gives each `aiFiles` attachment of a history page the preview address its
 * upload returned. A message stores the file's record, which holds no address
 * because the API's base path belongs to the deployment rather than the file.
 */
export function withAIFilePreviews<T extends { rows: unknown[] }>(
  page: T,
  apiBasePath: string,
): T {
  const withPreview = (attachment: unknown): unknown => {
    if (!isRecord(attachment)) return attachment;
    const source = attachment.source;
    const id = attachment.id;
    if (
      !isRecord(source) ||
      source.collectionName !== 'aiFiles' ||
      (typeof id !== 'string' && typeof id !== 'number') ||
      typeof attachment.preview === 'string'
    )
      return attachment;
    const preview = aiFilePreviewUrl(apiBasePath, id);
    return {
      ...attachment,
      preview,
      url: typeof attachment.url === 'string' ? attachment.url : preview,
    };
  };
  const withPreviews = (message: unknown): unknown => {
    if (!isRecord(message) || !isRecord(message.content)) return message;
    const content = { ...(message as HistoryMessage).content };
    if (Array.isArray(content.attachments))
      content.attachments = content.attachments.map(withPreview);
    if (Array.isArray(content.subAgentConversations))
      content.subAgentConversations = content.subAgentConversations.map(
        (conversation: unknown) =>
          isRecord(conversation) && Array.isArray(conversation.messages)
            ? {
                ...conversation,
                messages: conversation.messages.map(withPreviews),
              }
            : conversation,
      );
    return { ...message, content };
  };
  return { ...page, rows: page.rows.map(withPreviews) };
}
