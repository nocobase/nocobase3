import { describe, expect, it, vi } from 'vitest';
import { normalizeSegmentOptions } from '../server/managers/segment-options.js';
import { PGVectorProvider } from '../server/extensions/vector-database/pg-vector-provider.js';
import { KnowledgeBaseService } from '../server/services/knowledge-base-service.js';
import { VectorDatabaseService } from '../server/services/vector-database-service.js';

describe('knowledge base compatibility helpers', () => {
  it('normalizes segment bounds', () => {
    expect(
      normalizeSegmentOptions({ chunkSize: 10, chunkOverlap: 99 }),
    ).toEqual({ enabled: true, chunkSize: 10, chunkOverlap: 9 });
    expect(
      normalizeSegmentOptions({
        enabled: false,
        chunkSize: 0,
        chunkOverlap: -1,
      }),
    ).toEqual({ enabled: false, chunkSize: 6000, chunkOverlap: 0 });
  });
  it('validates safe PGVector table references', () => {
    const provider = new PGVectorProvider();
    expect(() =>
      provider.validateConnectParams({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        database: 'app',
        tableName: 'public.embeddings',
      }),
    ).not.toThrow();
    expect(() =>
      provider.validateConnectParams({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        database: 'app',
        tableName: 'public.embeddings;drop table users',
      }),
    ).toThrow();
  });
  it('owns and disposes PGVector pools idempotently', async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    const release = vi.fn();
    const query = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const connect = vi.fn().mockResolvedValue({ query, release });
    const createPool = vi.fn(() => ({ connect, end }) as never);
    const provider = new PGVectorProvider(createPool);

    const connectProps = {
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      database: 'app',
      tableName: 'public.embeddings',
    };
    await expect(provider.testConnection(connectProps)).resolves.toEqual({
      success: true,
    });
    await expect(provider.testConnection(connectProps)).resolves.toEqual({
      success: true,
    });
    await expect(
      provider.testConnection({
        ...connectProps,
        tableName: 'public.other_embeddings',
      }),
    ).resolves.toEqual({ success: true });
    expect(createPool).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledTimes(3);

    await provider.dispose();
    await provider.dispose();
    expect(end).toHaveBeenCalledOnce();
    await expect(provider.testConnection(connectProps)).resolves.toEqual({
      success: false,
      error: 'PGVector provider has been disposed',
    });
  });

  it('lists inline knowledge base config without a secondary lookup', async () => {
    const row = {
      id: 1,
      key: 'kb',
      vectorDatabaseKey: 'database',
      llmService: 'openai',
      embeddingModel: 'text-embedding',
    };
    const bases = {
      find: vi.fn().mockResolvedValue([row]),
      count: vi.fn().mockResolvedValue(1),
    };
    const service = new KnowledgeBaseService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      bases as never,
      {} as never,
      {} as never,
      [],
      { warn: vi.fn() },
    );

    await expect(
      service.list({ paginate: false, page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({ data: [row], meta: { count: 1 } });
    expect(bases.find).toHaveBeenCalledOnce();
  });

  it('reports inline config and vector database changes against confirmation time', async () => {
    const confirmedAt = new Date('2026-09-01T00:00:00.000Z');
    const vectorStoreUpdatedAt = new Date('2026-09-02T00:00:00.000Z');
    const vectorDatabaseUpdatedAt = new Date('2026-09-03T00:00:00.000Z');
    const service = new KnowledgeBaseService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        findOne: vi.fn().mockResolvedValue({
          key: 'kb',
          vectorDatabaseKey: 'database',
          confirmVectorStoreChanged: confirmedAt,
          vectorStoreUpdatedAt,
        }),
      } as never,
      {
        findOne: vi
          .fn()
          .mockResolvedValue({ updatedAt: vectorDatabaseUpdatedAt }),
      } as never,
      {} as never,
      [],
      { warn: vi.fn() },
    );

    await expect(
      service.checkVectorStoreChanged({ key: 'kb' }),
    ).resolves.toEqual({
      key: 'kb',
      changed: true,
      confirmVectorStoreChanged: confirmedAt,
      vectorStoreChanged: true,
      vectorDatabaseChanged: true,
      vectorStoreUpdatedAt,
      vectorDatabaseUpdatedAt,
    });
  });

  it('protects and finds vector databases through inline knowledge base fields', async () => {
    const related = [{ id: 1, key: 'kb', vectorDatabaseKey: 'database' }];
    const findBases = vi.fn().mockResolvedValue(related);
    const destroyVectors = vi.fn();
    const service = new VectorDatabaseService(
      {} as never,
      {
        findById: vi.fn().mockResolvedValue({ id: 2, key: 'database' }),
        destroy: destroyVectors,
      } as never,
      { find: findBases } as never,
    );

    await expect(service.destroy({ ids: [2] })).rejects.toMatchObject({
      message: 'Vector database is used by a knowledge base',
      status: 409,
    });
    expect(findBases).toHaveBeenCalledWith({
      filter: { vectorDatabaseKey: 'database' },
    });
    expect(destroyVectors).not.toHaveBeenCalled();
    await expect(
      service.findRelatedKnowledgeBases({ vectorDatabaseKey: 'database' }),
    ).resolves.toBe(related);
  });
});
