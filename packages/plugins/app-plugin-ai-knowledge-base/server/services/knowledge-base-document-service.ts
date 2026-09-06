import {
  assertKnowledgeBaseDocumentUploadSize,
  KNOWLEDGE_BASE_DOCUMENT_UPLOAD_CONSTRAINTS,
  type KnowledgeBaseDocumentUploadConstraints,
  type KnowledgeBaseDocumentUploadFile,
} from '../document-upload.js';
import type { KnowledgeBaseDocumentManager } from '../managers/knowledge-base-document-manager.js';
import type {
  KnowledgeBaseDocumentEntity,
  KnowledgeBaseDocumentRepository,
  KnowledgeBaseRepository,
} from '../repository/index.js';
import { page, type PageOptions, type PageResult } from './pagination.js';

export class KnowledgeBaseDocumentService {
  public constructor(
    private readonly manager: KnowledgeBaseDocumentManager,
    private readonly documents: KnowledgeBaseDocumentRepository,
    private readonly bases: KnowledgeBaseRepository,
  ) {}

  public list(
    options: PageOptions & { knowledgeBaseKey?: string },
  ): Promise<PageResult<Record<string, unknown>>> {
    return page({
      repository: this.documents,
      paging: options,
      filter: options.knowledgeBaseKey
        ? { knowledgeBaseKey: options.knowledgeBaseKey }
        : {},
      transform: (record) => ({ ...record, accessAbility: 'readWrite' }),
    });
  }

  public async get(options: {
    readonly id: string | number;
  }): Promise<Record<string, unknown> | null> {
    const record = await this.documents.findById(options.id);
    return record ? { ...record, accessAbility: 'readWrite' } : null;
  }

  public async upload(options: {
    readonly knowledgeBaseKey: string;
    readonly file: KnowledgeBaseDocumentUploadFile;
    readonly userId?: string | number;
  }): Promise<KnowledgeBaseDocumentEntity> {
    assertKnowledgeBaseDocumentUploadSize(options.file.size);
    const bytes = new Uint8Array(await options.file.arrayBuffer());
    return this.manager.upload(
      options.knowledgeBaseKey,
      {
        name: options.file.name,
        type: options.file.type,
        bytes,
      },
      options.userId,
    );
  }

  public async destroy(options: {
    readonly ids: readonly (string | number)[];
  }): Promise<void> {
    const records = await this.documents.find({
      filter: { id: { $in: options.ids } },
    });
    await this.manager.deleteDocuments([...options.ids]);
    for (const key of new Set(records.map((item) => item.knowledgeBaseKey))) {
      await this.manager.refreshStatistics(key);
    }
  }

  public async queueVectorization(options: {
    readonly knowledgeBaseKey?: string;
    readonly ids?: readonly (string | number)[];
  }): Promise<number> {
    const records = await this.documents.find({
      filter: {
        ...(options.knowledgeBaseKey
          ? { knowledgeBaseKey: options.knowledgeBaseKey }
          : {}),
        ...(options.ids?.length ? { id: { $in: options.ids } } : {}),
      },
    });
    for (const record of records) {
      await this.manager.dispatchVectorization(record.id);
    }
    return records.length;
  }

  public async getUploadStorage(options: {
    readonly knowledgeBaseKey: string;
  }): Promise<KnowledgeBaseDocumentUploadConstraints | null> {
    const base = await this.bases.findOne({ key: options.knowledgeBaseKey });
    return base
      ? {
          acceptedExtensions: [
            ...KNOWLEDGE_BASE_DOCUMENT_UPLOAD_CONSTRAINTS.acceptedExtensions,
          ],
          maxFileSizeBytes:
            KNOWLEDGE_BASE_DOCUMENT_UPLOAD_CONSTRAINTS.maxFileSizeBytes,
        }
      : null;
  }
}
