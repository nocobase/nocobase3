import type {
  JsonRecord,
  KnowledgeBaseDocumentRecord,
  KnowledgeBaseRecord,
} from '../internal-types.js';
import type { KnowledgeBaseDocumentManager } from '../managers/knowledge-base-document-manager.js';
import type { TableRepository } from '../repositories/table-repository.js';
import { page, type PageOptions, type PageResult } from './pagination.js';

export class KnowledgeBaseDocumentService {
  public constructor(
    private readonly manager: KnowledgeBaseDocumentManager,
    private readonly documents: TableRepository<KnowledgeBaseDocumentRecord>,
    private readonly bases: TableRepository<KnowledgeBaseRecord>,
  ) {}

  public list(
    options: PageOptions & { knowledgeBaseKey?: string },
  ): Promise<PageResult<JsonRecord>> {
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
  }): Promise<JsonRecord | null> {
    const record = await this.documents.findById(options.id);
    return record ? { ...record, accessAbility: 'readWrite' } : null;
  }

  public upload(options: {
    readonly knowledgeBaseKey: string;
    readonly file: { name: string; type?: string; bytes: Uint8Array };
    readonly userId?: string | number;
  }): Promise<KnowledgeBaseDocumentRecord> {
    return this.manager.upload(
      options.knowledgeBaseKey,
      options.file,
      options.userId,
    );
  }

  public finalizeUpload(options: {
    readonly knowledgeBaseKey: string;
    readonly values: JsonRecord;
    readonly userId?: string | number;
  }): Promise<KnowledgeBaseDocumentRecord> {
    return this.manager.finalizeUpload(
      options.knowledgeBaseKey,
      options.values,
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
  }): Promise<JsonRecord | null> {
    const base = await this.bases.findOne({ key: options.knowledgeBaseKey });
    return base
      ? {
          disk: base.disk,
          name: 'default',
          title: 'Default storage',
          type: 'local',
          rules: { size: 100 * 1024 * 1024 },
        }
      : null;
  }

  public getZipFilenameEncodingOptions(): JsonRecord {
    return {
      options: [
        { value: 'utf8', label: 'UTF-8', isDefault: true },
        { value: 'gbk', label: 'GBK' },
      ],
    };
  }
}
