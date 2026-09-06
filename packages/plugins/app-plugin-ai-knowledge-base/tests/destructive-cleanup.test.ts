import { describe, expect, it, vi } from 'vitest';

import { KnowledgeBaseDocumentManager } from '../server/managers/knowledge-base-document-manager.js';
import { KnowledgeBaseSegmentManager } from '../server/managers/knowledge-base-segment-manager.js';
import { KnowledgeBaseVectorCleanupManager } from '../server/managers/knowledge-base-vector-cleanup-manager.js';
import { KnowledgeBaseVectorizationManager } from '../server/managers/knowledge-base-vectorization-manager.js';
import { QueueVectorizationDispatcher } from '../server/managers/queue-vectorization-dispatcher.js';
import { KnowledgeBaseDocumentService } from '../server/services/knowledge-base-document-service.js';
import { KnowledgeBaseService } from '../server/services/knowledge-base-service.js';

const base = {
  id: 1,
  key: 'kb-1',
  knowledgeBaseType: 'LOCAL',
  knowledgeBaseOuterId: 'outer-1',
  vectorDatabaseKey: 'vector-database',
  llmService: 'openai',
  embeddingModel: 'text-embedding',
  vectorStoreConfigHash: 'config-hash',
  vectorStoreUpdatedAt: new Date('2026-09-02T00:00:00.000Z'),
  vectorStoreProvider: 'NocobaseLocalVectorStore',
  disk: 'private',
} as const;

const document = {
  id: 7,
  key: 'doc-7',
  knowledgeBaseKey: base.key,
  disk: 'private',
  path: 'documents/doc-7.pdf',
} as const;

const shard = {
  id: 9,
  knowledgeBaseKey: base.key,
  knowledgeBaseDocsId: document.id,
  shardNo: 0,
  segmentVersion: 1,
  segmentCount: 2,
  contentHash: 'old',
  filename: 'shard.json',
  extname: '.json',
  path: 'shards/shard.json',
  size: 10,
  mimetype: 'application/json',
  disk: 'private',
  meta: {},
} as const;

describe('knowledge base destructive cleanup', () => {
  it('uses the 2.x vector selectors for bases and documents', async () => {
    const deleteVectors = vi.fn().mockResolvedValue(undefined);
    const getVectorStore = vi.fn().mockResolvedValue({ delete: deleteVectors });
    const cleanup = new KnowledgeBaseVectorCleanupManager({
      get: getVectorStore,
    } as never);

    await cleanup.deleteKnowledgeBaseVectors(base as never);
    await cleanup.deleteDocumentVectors(base as never, [7, 8]);

    expect(getVectorStore).toHaveBeenNthCalledWith(1, 'kb-1');
    expect(getVectorStore).toHaveBeenNthCalledWith(2, 'kb-1');
    expect(deleteVectors.mock.calls).toEqual([
      [{ filter: { knowledgeBaseOuterId: 'outer-1' } }],
      [{ filter: { knowledgeBaseDocsId: 7 } }],
      [{ filter: { knowledgeBaseDocsId: 8 } }],
    ]);
  });

  it('rejects a partial document selection before cleanup', async () => {
    const manager = { deleteDocuments: vi.fn(), refreshStatistics: vi.fn() };
    const cleanup = { deleteDocumentVectors: vi.fn() };
    const service = new KnowledgeBaseDocumentService(
      manager as never,
      { find: vi.fn().mockResolvedValue([document]) } as never,
      {} as never,
      cleanup as never,
    );

    await expect(service.destroy({ ids: [7, 999] })).rejects.toMatchObject({
      message: 'Knowledge base document not found',
      status: 404,
    });
    expect(cleanup.deleteDocumentVectors).not.toHaveBeenCalled();
    expect(manager.deleteDocuments).not.toHaveBeenCalled();
  });

  it('deletes document vectors before source and shard artifacts', async () => {
    const order: string[] = [];
    const manager = {
      deleteDocuments: vi.fn(async () => order.push('artifacts')),
      refreshStatistics: vi.fn(async () => order.push('statistics')),
    };
    const cleanup = {
      deleteDocumentVectors: vi.fn(async () => order.push('vectors')),
    };
    const service = new KnowledgeBaseDocumentService(
      manager as never,
      { find: vi.fn().mockResolvedValue([document]) } as never,
      { findOne: vi.fn().mockResolvedValue(base) } as never,
      cleanup as never,
    );

    await service.destroy({ ids: [7] });

    expect(order).toEqual(['vectors', 'artifacts', 'statistics']);
    expect(manager.deleteDocuments).toHaveBeenCalledWith([document]);
  });

  it('continues base deletion when outer-id vector cleanup fails', async () => {
    const warningLogger = { warn: vi.fn() };
    const deleteDocuments = vi.fn().mockResolvedValue(undefined);
    const destroyBases = vi.fn().mockResolvedValue(1);
    const service = new KnowledgeBaseService(
      {} as never,
      {} as never,
      { deleteDocuments } as never,
      {
        deleteKnowledgeBaseVectors: vi
          .fn()
          .mockRejectedValue(new Error('vector unavailable')),
      } as never,
      {
        find: vi.fn().mockResolvedValue([base]),
        destroy: destroyBases,
      } as never,
      {} as never,
      { find: vi.fn().mockResolvedValue([document]) } as never,
      ['private'],
      warningLogger,
    );

    await service.destroy({ ids: [1] });

    expect(warningLogger.warn).toHaveBeenCalledOnce();
    expect(deleteDocuments).toHaveBeenCalledWith([document]);
    expect(destroyBases).toHaveBeenCalledWith({ id: { $in: [1] } });
  });

  it('removes segment content from its shard and refreshes revision state', async () => {
    const replaceShardContents = vi.fn().mockResolvedValue(undefined);
    const destroy = vi.fn().mockResolvedValue(1);
    const markSegmentsChanged = vi.fn().mockResolvedValue(undefined);
    const manager = new KnowledgeBaseSegmentManager(
      {
        findOne: vi.fn().mockResolvedValue({
          id: 11,
          uid: 'segment-a',
          contentKey: 'segment-a',
          shardId: shard.id,
          knowledgeBaseDocsId: document.id,
        }),
        destroy,
      } as never,
      { findById: vi.fn().mockResolvedValue(shard) } as never,
      { require: vi.fn().mockResolvedValue(base) } as never,
      {
        readShardContents: vi.fn().mockResolvedValue({
          'segment-a': { content: 'remove me' },
          'segment-b': { content: 'keep me' },
        }),
        replaceShardContents,
      } as never,
      { markSegmentsChanged } as never,
    );

    await expect(manager.deleteContent(7, 'segment-a')).resolves.toBe(true);

    expect(replaceShardContents).toHaveBeenCalledWith(shard, {
      'segment-b': { content: 'keep me' },
    });
    expect(destroy).toHaveBeenCalledWith({ id: 11 });
    expect(markSegmentsChanged).toHaveBeenCalledWith(7);
  });

  it('keeps queue grouping without suppressing later document operations', async () => {
    const dispatch = vi.fn().mockResolvedValue({});
    const dispatcher = new QueueVectorizationDispatcher({ dispatch } as never);

    await dispatcher.dispatch({ documentId: 7, rebuildOnly: true });

    expect(dispatch.mock.calls[0]?.[2]).toEqual({ groupId: 'ai-kb-doc:7' });
  });

  it('deletes physical shard and source objects before metadata rows', async () => {
    const calls: string[] = [];
    const manager = new KnowledgeBaseDocumentManager(
      {} as never,
      { destroy: vi.fn(async () => calls.push('documents')) } as never,
      { destroy: vi.fn(async () => calls.push('segments')) } as never,
      {
        find: vi.fn().mockResolvedValue([shard]),
        destroy: vi.fn(async () => calls.push('shard metadata')),
      } as never,
      {} as never,
      {
        deleteSegmentShardObject: vi.fn(async () => calls.push('shard object')),
        deleteDocumentObject: vi.fn(async () => calls.push('source object')),
      } as never,
      {} as never,
      { warn: vi.fn() },
    );

    await manager.deleteDocuments([document as never]);

    expect(calls).toEqual([
      'shard object',
      'source object',
      'segments',
      'shard metadata',
      'documents',
    ]);
  });

  it('treats a stale vectorization job as a successful no-op', async () => {
    const ai = { features: { vectorStoreProvider: {} } };
    const manager = new KnowledgeBaseVectorizationManager(
      ai as never,
      { findById: vi.fn().mockResolvedValue(null) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(manager.vectorize(999)).resolves.toBeUndefined();
    await expect(manager.reindexExistingSegments(999)).resolves.toBeUndefined();
  });

  it('redispatches when segments change during a vector rebuild', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const dispatchVectorization = vi.fn().mockResolvedValue(undefined);
    const documents = {
      findById: vi
        .fn()
        .mockResolvedValueOnce({ ...document, segmentRevision: 2 })
        .mockResolvedValueOnce({ ...document, segmentRevision: 3 }),
      update: vi.fn(async (_filter, values) => updates.push(values)),
    };
    const store = {
      delete: vi.fn().mockResolvedValue(undefined),
      addDocuments: vi.fn().mockResolvedValue(undefined),
    };
    const createVectorStoreService = vi.fn().mockResolvedValue({
      getVectorStore: vi.fn().mockResolvedValue(store),
    });
    const manager = new KnowledgeBaseVectorizationManager(
      {
        features: {
          vectorStoreProvider: { createVectorStoreService },
        },
      } as never,
      documents as never,
      { find: vi.fn().mockResolvedValue([]) } as never,
      { require: vi.fn().mockResolvedValue(base) } as never,
      { dispatchVectorization } as never,
      {} as never,
      {} as never,
    );

    await manager.reindexExistingSegments(document.id);

    expect(createVectorStoreService).toHaveBeenCalledWith(
      'NocobaseLocalVectorStore',
      [{ key: 'knowledgeBaseKey', value: 'kb-1' }],
    );
    expect(dispatchVectorization).toHaveBeenCalledWith(
      document.id,
      undefined,
      true,
    );
    expect(updates).not.toContainEqual(
      expect.objectContaining({ indexStatus: 'SUCCESS' }),
    );
  });
});
