import type { DatabaseConnection } from '@nocobase/db';
import { describe, expect, it, vi } from 'vitest';
import { TableRepository } from '../server/repositories/table-repository.js';
import { normalizeSegmentOptions } from '../server/managers/segment-options.js';
import { PGVectorProvider } from '../server/providers/vector-database/pg-vector-provider.js';

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
});
