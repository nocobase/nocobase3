import { nanoid } from 'nanoid';

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
    const key = nanoid(32);
    let metadata;
    try {
      metadata = await this.storage.writeDocument(base, {
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
    } catch (cause) {
      throw new KnowledgeBaseUploadError(
        'STORAGE_UNAVAILABLE',
        'Document storage is unavailable.',
        503,
        { cause },
      );
    }
    try {
      await this.dispatchVectorization(metadata.entity.id);
    } catch (dispatchError) {
      const errorMessage =
        'Vectorization could not be queued. Retry vectorization later.';
      this.warningLogger.warn(
        'Knowledge base document vectorization dispatch failed.',
        { documentId: metadata.entity.id, error: dispatchError },
      );
      try {
        await this.documents.update(
          { id: metadata.entity.id },
          { indexStatus: 'ERROR', errorMessage },
        );
      } catch (statusUpdateError) {
        this.warningLogger.warn(
          'Knowledge base document ERROR status persistence failed after vectorization dispatch failure.',
          {
            documentId: metadata.entity.id,
            dispatchError,
            statusUpdateError,
          },
        );
      }
      return {
        ...metadata.entity,
        indexStatus: 'ERROR',
        errorMessage,
      };
    }
    return metadata.entity;
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
