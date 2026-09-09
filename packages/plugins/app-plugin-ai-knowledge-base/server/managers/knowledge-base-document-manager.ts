import { nanoid } from 'nanoid';
import type { OpenedFile } from '@nocobase/ai-employee';

import {
  assertKnowledgeBaseDocumentUploadSize,
  KnowledgeBaseUploadError,
  SUPPORTED_KNOWLEDGE_BASE_DOCUMENT_EXTENSIONS,
} from '../document-upload.js';
import type {
  KnowledgeBaseVectorizationDispatcher,
  KnowledgeBaseWarningLogger,
} from '../internal-types.js';
import type {
  KnowledgeBaseDocumentEntity,
  KnowledgeBaseDocumentRepository,
  KnowledgeBaseRepository,
  KnowledgeBaseSegmentRepository,
  KnowledgeBaseSegmentShardRepository,
} from '../repository/index.js';
import type { KnowledgeBaseManager } from './knowledge-base-manager.js';
import type { KnowledgeBaseStorageManager } from './knowledge-base-storage-manager.js';

const EXTENSIONS = new Set<string>(
  SUPPORTED_KNOWLEDGE_BASE_DOCUMENT_EXTENSIONS,
);
export class KnowledgeBaseDocumentManager {
  public constructor(
    private readonly bases: KnowledgeBaseRepository,
    private readonly documents: KnowledgeBaseDocumentRepository,
    private readonly segments: KnowledgeBaseSegmentRepository,
    private readonly segmentShards: KnowledgeBaseSegmentShardRepository,
    private readonly knowledgeBases: KnowledgeBaseManager,
    private readonly storage: KnowledgeBaseStorageManager,
    private readonly vectorizationDispatcher: KnowledgeBaseVectorizationDispatcher,
    private readonly warningLogger: KnowledgeBaseWarningLogger,
  ) {}

  public async upload(
    knowledgeBaseKey: string,
    file: { name: string; type?: string; bytes: Uint8Array },
    actorId?: string | number,
  ): Promise<KnowledgeBaseDocumentEntity> {
    const stored = await this.storeDocument(knowledgeBaseKey, file, {
      actorId,
    });
    try {
      await this.dispatchVectorization(stored.id);
    } catch (dispatchError) {
      const errorMessage =
        'Vectorization could not be queued. Retry vectorization later.';
      this.warningLogger.warn(
        'Knowledge base document vectorization dispatch failed.',
        { documentId: stored.id, error: dispatchError },
      );
      try {
        await this.documents.update(
          { id: stored.id },
          { indexStatus: 'ERROR', errorMessage },
        );
      } catch (statusUpdateError) {
        this.warningLogger.warn(
          'Knowledge base document ERROR status persistence failed after vectorization dispatch failure.',
          {
            documentId: stored.id,
            dispatchError,
            statusUpdateError,
          },
        );
      }
      return { ...stored, indexStatus: 'ERROR', errorMessage };
    }
    return stored;
  }

  public async open(
    id: string | number,
  ): Promise<OpenedFile<KnowledgeBaseDocumentEntity> | null> {
    const document = await this.documents.findById(id);
    return document ? this.storage.openDocument(document) : null;
  }

  public async storeDocument(
    knowledgeBaseKey: string,
    file: { name: string; type?: string; bytes: Uint8Array },
    options: {
      readonly actorId?: string | number;
      readonly documentKey?: string;
    } = {},
  ): Promise<KnowledgeBaseDocumentEntity> {
    let base;
    try {
      base = await this.knowledgeBases.require(knowledgeBaseKey);
    } catch (cause) {
      if (cause instanceof Error && /not found/i.test(cause.message)) {
        throw new KnowledgeBaseUploadError(
          'KNOWLEDGE_BASE_NOT_FOUND',
          `Knowledge base #${knowledgeBaseKey} not found`,
          404,
          { cause },
        );
      }
      throw cause;
    }
    if (base.knowledgeBaseType !== 'LOCAL') {
      throw new KnowledgeBaseUploadError(
        'LOCAL_KNOWLEDGE_BASE_REQUIRED',
        'Only LOCAL knowledge bases accept documents.',
        400,
      );
    }
    const ext = this.extension(file.name);
    if (!EXTENSIONS.has(ext)) {
      throw new KnowledgeBaseUploadError(
        'UNSUPPORTED_FILE_TYPE',
        `Unsupported file type: ${ext || 'none'}`,
        415,
      );
    }
    assertKnowledgeBaseDocumentUploadSize(file.bytes.byteLength);
    const key = options.documentKey ?? nanoid(32);
    try {
      const metadata = await this.storage.writeDocument(base, {
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
          createdById: options.actorId,
        },
      });
      return metadata.entity;
    } catch (cause) {
      throw new KnowledgeBaseUploadError(
        'STORAGE_UNAVAILABLE',
        'Document storage is unavailable.',
        503,
        { cause },
      );
    }
  }

  public async replaceDocumentForRecovery(
    document: KnowledgeBaseDocumentEntity,
    file: { name: string; type?: string; bytes: Uint8Array },
  ): Promise<KnowledgeBaseDocumentEntity> {
    const ext = this.extension(file.name);
    if (!EXTENSIONS.has(ext)) {
      throw new KnowledgeBaseUploadError(
        'UNSUPPORTED_FILE_TYPE',
        `Unsupported file type: ${ext || 'none'}`,
        415,
      );
    }
    assertKnowledgeBaseDocumentUploadSize(file.bytes.byteLength);
    await this.deleteSegmentArtifacts([document.id]);
    await this.storage.replaceDocumentObject(document, file.bytes, file.type);
    await this.documents.update(
      { id: document.id },
      {
        title: file.name,
        filename: file.name,
        extname: ext,
        size: file.bytes.byteLength,
        mimetype: file.type ?? 'application/octet-stream',
        indexStatus: 'PENDING',
        errorMessage: null,
        characterCount: 0,
        segmentCount: 0,
        segmentVersion: 0,
        segmentRevision: Number(document.segmentRevision ?? 0) + 1,
        segmentStatus: 'PENDING',
        segmentErrorMessage: null,
        segmentUpdatedAt: new Date(),
      },
    );
    const updated = await this.documents.findById(document.id);
    if (!updated)
      throw new Error('Recovered knowledge base document was lost.');
    return updated;
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

  public async deleteDocuments(
    documents: readonly KnowledgeBaseDocumentEntity[],
  ): Promise<void> {
    if (!documents.length) return;
    const ids = documents.map((item) => item.id);
    const shards = await this.segmentShards.find({
      filter: { knowledgeBaseDocsId: { $in: ids } },
    });
    for (const shard of shards) {
      await this.storage.deleteSegmentShardObject(shard);
    }
    for (const document of documents) {
      await this.storage.deleteDocumentObject(document);
    }
    await this.segments.destroy({ knowledgeBaseDocsId: { $in: ids } });
    await this.segmentShards.destroy({ knowledgeBaseDocsId: { $in: ids } });
    await this.documents.destroy({ id: { $in: ids } });
  }

  public async deleteSegmentArtifacts(
    ids: readonly (string | number)[],
  ): Promise<void> {
    if (!ids.length) return;
    const shards = await this.segmentShards.find({
      filter: { knowledgeBaseDocsId: { $in: ids } },
    });
    for (const shard of shards) {
      await this.storage.deleteSegmentShardObject(shard);
    }
    await this.segments.destroy({ knowledgeBaseDocsId: { $in: ids } });
    await this.segmentShards.destroy({ knowledgeBaseDocsId: { $in: ids } });
  }
  public async markSegmentsChanged(id: string | number): Promise<void> {
    const document = await this.documents.findById(id);
    if (!document) return;
    const segments = await this.segments.find({
      filter: { knowledgeBaseDocsId: id },
    });
    await this.documents.update(
      { id },
      {
        segmentCount: segments.length,
        characterCount: segments
          .filter((item) => item.enabled !== false)
          .reduce((sum, item) => sum + Number(item.charLength || 0), 0),
        segmentRevision: Number(document.segmentRevision || 0) + 1,
        segmentUpdatedAt: new Date(),
        indexStatus: 'PENDING',
        errorMessage: null,
      },
    );
    await this.refreshStatistics(document.knowledgeBaseKey);
    await this.vectorizationDispatcher.dispatch({
      documentId: id,
      rebuildOnly: true,
    });
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

  private extension(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot < 0 ? '' : filename.slice(dot).toLowerCase();
  }
}
