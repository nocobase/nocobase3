import { createHash } from 'node:crypto';

import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { DocumentLoader, type AIManager } from '@nocobase/ai-employee';
import { nanoid } from 'nanoid';

import { KnowledgeBaseDocumentMetadataRepository } from '../file-storage/index.js';
import type {
  JsonRecord,
  KnowledgeBaseDocumentRecord,
  SegmentQuestion,
  SegmentRecord,
} from '../internal-types.js';
import type { TableRepository } from '../repositories/table-repository.js';
import type { KnowledgeBaseDocumentManager } from './knowledge-base-document-manager.js';
import type { KnowledgeBaseManager } from './knowledge-base-manager.js';
import type { KnowledgeBaseSegmentManager } from './knowledge-base-segment-manager.js';
import type { KnowledgeBaseStorageManager } from './knowledge-base-storage-manager.js';
import { normalizeSegmentOptions } from './segment-options.js';

const sha = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
const preview = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().slice(0, 200);

type WritableVectorStore = {
  delete(options: { filter: Record<string, unknown> }): Promise<void>;
  addDocuments(documents: Document[]): Promise<void>;
};

export class KnowledgeBaseVectorizationManager {
  public constructor(
    private readonly ai: AIManager,
    private readonly documents: TableRepository<KnowledgeBaseDocumentRecord>,
    private readonly segments: TableRepository<SegmentRecord>,
    private readonly knowledgeBases: KnowledgeBaseManager,
    private readonly documentManager: KnowledgeBaseDocumentManager,
    private readonly segmentManager: KnowledgeBaseSegmentManager,
    private readonly storage: KnowledgeBaseStorageManager,
  ) {}

  public async reindexExistingSegments(id: string | number): Promise<void> {
    const document = await this.documents.findById(id);
    if (!document) throw new Error(`Knowledge base document #${id} not found`);
    const base = await this.knowledgeBases.require(document.knowledgeBaseKey);
    await this.documents.update(
      { id },
      { indexStatus: 'PROCESSING', errorMessage: null },
    );
    try {
      await this.rebuildVectors(
        base.vectorStoreProvider,
        base.vectorStoreConfigKey,
        base.knowledgeBaseType,
        base.knowledgeBaseOuterId,
        id,
      );
      const rows = await this.segments.find({
        filter: { knowledgeBaseDocsId: id },
      });
      await this.documents.update(
        { id },
        {
          indexStatus: 'SUCCESS',
          errorMessage: null,
          segmentCount: rows.length,
          characterCount: rows
            .filter((row) => row.enabled !== false)
            .reduce((sum, row) => sum + Number(row.charLength || 0), 0),
          segmentRevision: Number(document.segmentRevision || 0) + 1,
          segmentUpdatedAt: new Date(),
        },
      );
      await this.documentManager.refreshStatistics(base.key);
    } catch (error) {
      await this.documents.update(
        { id },
        {
          indexStatus: 'ERROR',
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      );
      throw error;
    }
  }

  public async vectorize(
    id: string | number,
    relatedQuestions: string[] = [],
  ): Promise<void> {
    const document = await this.documents.findById(id);
    if (!document) throw new Error(`Knowledge base document #${id} not found`);
    const base = await this.knowledgeBases.require(document.knowledgeBaseKey);
    await this.documents.update(
      { id },
      {
        indexStatus: 'PROCESSING',
        segmentStatus: 'PROCESSING',
        errorMessage: null,
      },
    );
    try {
      const loaded = await this.loadDocument(document);
      const options = normalizeSegmentOptions(
        document.segmentOptions ?? base.segmentOptions,
      );
      const splits = options.enabled
        ? await new RecursiveCharacterTextSplitter(options).splitDocuments(
            loaded,
          )
        : [
            new Document({
              pageContent: loaded.map((item) => item.pageContent).join('\n\n'),
            }),
          ];
      await this.segmentManager.deleteByDocumentIds(id);
      const version = Number(document.segmentVersion ?? 0) + 1;
      for (let shardNo = 0; shardNo * 100 < splits.length; shardNo++) {
        const batch = splits.slice(shardNo * 100, shardNo * 100 + 100);
        const contents: Record<
          string,
          { title: string; content: string; questions: SegmentQuestion[] }
        > = {};
        const pending: Array<Partial<SegmentRecord>> = [];
        batch.forEach((item, index) => {
          const uid = nanoid(32);
          const content = item.pageContent.replace(/\r\n/g, '\n');
          const questions = relatedQuestions.map((question) => ({
            id: nanoid(16),
            content: question,
            enabled: true,
            hash: sha(question),
          }));
          contents[uid] = { title: '', content, questions };
          pending.push({
            uid,
            knowledgeBaseKey: base.key,
            knowledgeBaseOuterId: base.knowledgeBaseOuterId,
            knowledgeBaseDocsId: id,
            shardNo,
            contentKey: uid,
            position: shardNo * 100 + index,
            title: '',
            preview: preview(content),
            contentHash: sha(`\n${content}`),
            charLength: content.length,
            questionCount: questions.length,
            enabled: true,
            segmentVersion: version,
            meta: item.metadata as JsonRecord,
          });
        });
        const json = JSON.stringify({
          schemaVersion: 1,
          knowledgeBaseKey: base.key,
          knowledgeBaseDocsId: id,
          segmentVersion: version,
          shardNo,
          segments: contents,
        });
        const metadata = await this.storage
          .createSegmentShardStorage(base)
          .write({
            objectId: `${document.id}/shard-${shardNo}`,
            filename: `shard-${String(shardNo).padStart(4, '0')}.json`,
            content: Buffer.from(json),
            mimeType: 'application/json',
            metadataContext: {
              knowledgeBaseKey: base.key,
              knowledgeBaseDocsId: document.id,
              shardNo,
              segmentVersion: version,
              segmentCount: batch.length,
              contentHash: sha(json),
              meta: {},
              createdById: document.createdById,
            },
          });
        await this.segments.createMany(
          pending.map((item) => ({ ...item, shardId: metadata.entity.id })),
        );
      }
      await this.rebuildVectors(
        base.vectorStoreProvider,
        base.vectorStoreConfigKey,
        base.knowledgeBaseType,
        base.knowledgeBaseOuterId,
        id,
      );
      const characterCount = splits.reduce(
        (sum, item) => sum + item.pageContent.length,
        0,
      );
      await this.documents.update(
        { id },
        {
          indexStatus: 'SUCCESS',
          segmentStatus: 'SUCCESS',
          segmentVersion: version,
          segmentRevision: Number(document.segmentRevision ?? 0) + 1,
          segmentUpdatedAt: new Date(),
          segmentCount: splits.length,
          characterCount,
          errorMessage: null,
          segmentErrorMessage: null,
        },
      );
      await this.documentManager.refreshStatistics(base.key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.documents.update(
        { id },
        {
          indexStatus: 'ERROR',
          segmentStatus: 'ERROR',
          errorMessage: message,
          segmentErrorMessage: message,
        },
      );
      throw error;
    }
  }

  private async rebuildVectors(
    providerName: string,
    vectorStoreConfigKey: string | undefined,
    knowledgeBaseType: string,
    knowledgeBaseOuterId: string,
    documentId: string | number,
  ): Promise<void> {
    if (knowledgeBaseType !== 'LOCAL' || !vectorStoreConfigKey) return;
    const service =
      await this.ai.features.vectorStoreProvider.createVectorStoreService(
        providerName,
        [{ key: 'vectorStoreConfigKey', value: vectorStoreConfigKey }],
      );
    const store = (await service.getVectorStore()) as WritableVectorStore;
    await store.delete({ filter: { knowledgeBaseDocsId: documentId } });
    const rows = await this.segments.find({
      filter: { knowledgeBaseDocsId: documentId, enabled: true },
      sort: ['position'],
    });
    const documents: Document[] = [];
    for (const row of rows) {
      const value = await this.segmentManager.getContent(documentId, row.uid);
      if (!value) continue;
      const metadata = {
        ...row.meta,
        knowledgeBaseDocsId: documentId,
        knowledgeBaseOuterId,
        segmentUid: row.uid,
        sourceType: 'paragraph',
      };
      documents.push(
        new Document({
          pageContent: String(value.content ?? ''),
          metadata,
          id: row.uid,
        }),
      );
      for (const question of (
        (value.questions as SegmentQuestion[]) ?? []
      ).filter((item) => item.enabled !== false)) {
        documents.push(
          new Document({
            pageContent: question.content,
            metadata: { ...metadata, sourceType: 'question' },
          }),
        );
      }
    }
    for (let index = 0; index < documents.length; index += 10) {
      await store.addDocuments(documents.slice(index, index + 10));
    }
  }

  private async loadDocument(
    document: KnowledgeBaseDocumentRecord,
  ): Promise<Document[]> {
    const base = await this.knowledgeBases.require(document.knowledgeBaseKey);
    const metadata = await new KnowledgeBaseDocumentMetadataRepository(
      this.documents,
    ).findById(document.id);
    if (!metadata) {
      throw new Error(
        `Knowledge base document #${document.id} metadata not found`,
      );
    }
    return new DocumentLoader(
      this.storage.createDocumentStorage(base),
    ).loadMetadata(metadata);
  }
}
