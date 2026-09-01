import type { DatabaseConnection } from '@nocobase/db';
import { describe, expect, it, vi } from 'vitest';
import { TableRepository } from '../server/repository.js';
import { normalizeSegmentOptions } from '../server/service.js';
import { PGVectorProvider } from '../server/vector.js';

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
  it('reads an inserted row through an explicit fallback filter', async () => {
    const execute = vi.fn().mockResolvedValue({ insertedCount: 1 });
    const values = vi.fn(() => ({ execute }));
    const insertInto = vi.fn(() => ({ values }));
    const executeSelect = vi.fn().mockResolvedValue([{ id: 42, shardNo: 0 }]);
    const limit = vi.fn(() => ({ execute: executeSelect }));
    const where = vi.fn(function () {
      return { where, limit };
    });
    const selectAll = vi.fn(() => ({ where, limit }));
    const selectFrom = vi.fn(() => ({ selectAll }));
    const database = {
      query: { insertInto, selectFrom },
    } as unknown as DatabaseConnection;
    const repository = new TableRepository<Record<string, unknown>>(
      database,
      'aiKnowledgeBaseDocSegmentShards',
    );

    await expect(
      repository.create(
        { knowledgeBaseDocsId: 7, segmentVersion: 3, shardNo: 0 },
        { knowledgeBaseDocsId: 7, segmentVersion: 3, shardNo: 0 },
      ),
    ).resolves.toMatchObject({ id: 42 });
    expect(where).toHaveBeenCalledTimes(3);
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
});
