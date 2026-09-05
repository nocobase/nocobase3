import { nanoid } from 'nanoid';

import type {
  JsonRecord,
  KnowledgeBaseDocumentRecord,
  KnowledgeBaseRecord,
  KnowledgeBaseVectorizationDispatcher,
  SegmentRecord,
  SegmentShardRecord,
} from '../internal-types.js';
import type { TableRepository } from '../repositories/table-repository.js';
import { extractZipFiles } from '../zip.js';
import type { KnowledgeBaseManager } from './knowledge-base-manager.js';
import type { KnowledgeBaseStorageManager } from './knowledge-base-storage-manager.js';

const EXTENSIONS = new Set(['.doc', '.docx', '.md', '.pdf', '.txt', '.zip']);

export class KnowledgeBaseDocumentManager {
  public constructor(
    private readonly bases: TableRepository<KnowledgeBaseRecord>,
    private readonly documents: TableRepository<KnowledgeBaseDocumentRecord>,
    private readonly segments: TableRepository<SegmentRecord>,
    private readonly segmentShards: TableRepository<SegmentShardRecord>,
    private readonly knowledgeBases: KnowledgeBaseManager,
    private readonly storage: KnowledgeBaseStorageManager,
    private readonly vectorizationDispatcher: KnowledgeBaseVectorizationDispatcher,
  ) {}

  public async upload(
    knowledgeBaseKey: string,
    file: { name: string; type?: string; bytes: Uint8Array },
    actorId?: string | number,
  ): Promise<KnowledgeBaseDocumentRecord> {
    const base = await this.knowledgeBases.require(knowledgeBaseKey);
    if (base.knowledgeBaseType !== 'LOCAL') {
      throw new Error('Only LOCAL knowledge bases accept documents');
    }
    const ext = this.extension(file.name);
    if (!EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported file type: ${ext || 'none'}`);
    }
    if (ext === '.zip') {
      const extracted = (await extractZipFiles(file.bytes)).filter(
        (entry) =>
          EXTENSIONS.has(this.extension(entry.name)) &&
          this.extension(entry.name) !== '.zip',
      );
      if (!extracted.length) {
        throw new Error('ZIP archive contains no supported documents');
      }
      const created: KnowledgeBaseDocumentRecord[] = [];
      for (const entry of extracted) {
        created.push(
          await this.upload(
            knowledgeBaseKey,
            { name: entry.name, bytes: entry.bytes },
            actorId,
          ),
        );
      }
      return created[0];
    }
    const key = nanoid(32);
    const metadata = await this.storage.createDocumentStorage(base).write({
      objectId: key,
      filename: file.name,
      content: file.bytes,
      size: file.bytes.byteLength,
      mimeType: file.type,
      metadataContext: {
        key,
        knowledgeBaseKey: base.key,
        title: file.name,
        segmentOptions: base.segmentOptions,
        createdById: actorId,
      },
    });
    await this.dispatchVectorization(metadata.entity.id);
    return metadata.entity;
  }

  public async finalizeUpload(
    knowledgeBaseKey: string,
    values: JsonRecord,
    actorId?: string | number,
  ): Promise<KnowledgeBaseDocumentRecord> {
    const base = await this.knowledgeBases.require(knowledgeBaseKey);
    const filename = String(values.title ?? values.filename ?? 'file');
    const extname = String(
      values.extname ?? this.extension(filename),
    ).toLowerCase();
    if (!EXTENSIONS.has(extname)) {
      throw new Error(`Unsupported file type: ${extname || 'none'}`);
    }
    const disk = this.storage.requireAllowedStorageDisk(
      values.disk ?? base.disk,
    );
    if (disk !== base.disk) {
      throw new Error(
        `Upload disk "${disk}" does not match knowledge base disk "${base.disk}".`,
      );
    }
    const record = await this.documents.create({
      key: String(values.key ?? nanoid(32)),
      title: filename,
      filename: String(values.filename ?? filename),
      extname,
      size: Number(values.size ?? 0),
      mimetype: String(values.mimetype ?? 'application/octet-stream'),
      path: String(values.path ?? ''),
      ...(values.url ? { url: String(values.url) } : {}),
      disk,
      meta: this.jsonRecord(values.meta),
      knowledgeBaseKey,
      indexStatus: 'PENDING',
      errorMessage: null,
      characterCount: 0,
      segmentCount: 0,
      segmentVersion: 0,
      segmentRevision: 0,
      segmentStatus: 'PENDING',
      segmentErrorMessage: null,
      segmentOptions: base.segmentOptions,
      enabled: true,
      createdById: actorId,
    });
    await this.dispatchVectorization(record.id);
    return record;
  }

  public async dispatchVectorization(
    id: string | number,
    relatedQuestions?: string[],
    rebuildOnly = false,
  ): Promise<void> {
    await this.documents.update(
      { id },
      { indexStatus: 'PENDING', errorMessage: null },
    );
    await this.vectorizationDispatcher.dispatch({
      documentId: id,
      ...(relatedQuestions ? { relatedQuestions } : {}),
      rebuildOnly,
    });
  }

  public async deleteDocuments(ids: Array<string | number>): Promise<void> {
    await this.segments.destroy({ knowledgeBaseDocsId: { $in: ids } });
    await this.segmentShards.destroy({ knowledgeBaseDocsId: { $in: ids } });
    await this.documents.destroy({ id: { $in: ids } });
  }

  public async refreshStatistics(key: string): Promise<void> {
    const documents = await this.documents.find({
      filter: { knowledgeBaseKey: key },
    });
    await this.bases.update(
      { key },
      {
        documentCount: documents.length,
        characterCount: documents.reduce(
          (sum, item) => sum + Number(item.characterCount ?? 0),
          0,
        ),
      },
    );
  }

  private jsonRecord(value: unknown): JsonRecord {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonRecord)
      : {};
  }

  private extension(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot < 0 ? '' : filename.slice(dot).toLowerCase();
  }
}
