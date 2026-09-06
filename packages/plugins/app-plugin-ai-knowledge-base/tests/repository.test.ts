import type { DatabaseConnection } from '@nocobase/db';
import { describe, expect, it, vi } from 'vitest';

import {
  KnowledgeBaseDocumentRepository,
  KnowledgeBaseRepository,
  KnowledgeBaseSegmentRepository,
  KnowledgeBaseSegmentShardRepository,
  VectorDatabaseRepository,
  VectorStoreConfigRepository,
} from '../server/repository/index.js';

function createWriteDatabase(): {
  database: DatabaseConnection;
  values: ReturnType<typeof vi.fn>;
} {
  const execute = vi.fn().mockResolvedValue({ insertedCount: 1 });
  const values = vi.fn(() => ({ execute }));
  const insertInto = vi.fn(() => ({ values }));
  return {
    database: { query: { insertInto } } as unknown as DatabaseConnection,
    values,
  };
}

function createReadDatabase(row: Record<string, unknown>): DatabaseConnection {
  const execute = vi.fn().mockResolvedValue([row]);
  const selectAll = vi.fn(() => ({ execute }));
  const selectFrom = vi.fn(() => ({ selectAll }));
  return { query: { selectFrom } } as unknown as DatabaseConnection;
}

describe('knowledge base repositories', () => {
  it('binds every concrete repository to its table', () => {
    const database = { query: {} } as unknown as DatabaseConnection;

    expect(new KnowledgeBaseRepository(database).table).toBe('aiKnowledgeBase');
    expect(new KnowledgeBaseDocumentRepository(database).table).toBe(
      'aiKnowledgeBaseDocs',
    );
    expect(new KnowledgeBaseSegmentRepository(database).table).toBe(
      'aiKnowledgeBaseDocSegments',
    );
    expect(new KnowledgeBaseSegmentShardRepository(database).table).toBe(
      'aiKnowledgeBaseDocSegmentShards',
    );
    expect(new VectorDatabaseRepository(database).table).toBe(
      'aiVectorDatabases',
    );
    expect(new VectorStoreConfigRepository(database).table).toBe(
      'aiVectorStoreConfig',
    );
  });

  it.each([
    {
      create: (database: DatabaseConnection) =>
        new KnowledgeBaseRepository(database),
      input: {
        vectorStoreProps: [{ key: 'dimension', value: 1536 }],
        segmentOptions: { enabled: true, chunkSize: 6000, chunkOverlap: 0 },
      },
    },
    {
      create: (database: DatabaseConnection) =>
        new KnowledgeBaseDocumentRepository(database),
      input: {
        meta: { source: 'upload' },
        segmentOptions: { enabled: true, chunkSize: 1200, chunkOverlap: 100 },
      },
    },
    {
      create: (database: DatabaseConnection) =>
        new KnowledgeBaseSegmentRepository(database),
      input: { meta: { questions: ['one'] } },
    },
    {
      create: (database: DatabaseConnection) =>
        new KnowledgeBaseSegmentShardRepository(database),
      input: { meta: { segments: [{ content: 'hello' }] } },
    },
    {
      create: (database: DatabaseConnection) =>
        new VectorDatabaseRepository(database),
      input: { connectProps: { host: 'localhost', port: 5432 } },
    },
  ])(
    'encodes and decodes the configured JSON fields',
    async ({ create, input }) => {
      const write = createWriteDatabase();
      await create(write.database).createMany([input]);
      const inserted = write.values.mock.calls[0]?.[0]?.[0] as Record<
        string,
        unknown
      >;
      for (const [field, value] of Object.entries(input)) {
        expect(inserted[field]).toBe(JSON.stringify(value));
      }

      const decoded = await create(
        createReadDatabase(
          Object.fromEntries(
            Object.entries(input).map(([field, value]) => [
              field,
              JSON.stringify(value),
            ]),
          ),
        ),
      ).find();
      expect(decoded[0]).toMatchObject(input);
    },
  );

  it('does not transform vector store config fields', async () => {
    const input = {
      name: '{"legacy":true}',
      embeddingModel: 'text-embedding',
    };
    const write = createWriteDatabase();
    await new VectorStoreConfigRepository(write.database).createMany([input]);
    const inserted = write.values.mock.calls[0]?.[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(inserted.name).toBe(input.name);
    expect(typeof inserted.name).toBe('string');

    const rows = await new VectorStoreConfigRepository(
      createReadDatabase({ name: '{"legacy":true}' }),
    ).find();
    expect(rows[0]?.name).toBe('{"legacy":true}');
  });

  it('preserves malformed legacy JSON values', async () => {
    const rows = await new VectorDatabaseRepository(
      createReadDatabase({ connectProps: '{not-json' }),
    ).find();
    expect(rows[0]?.connectProps).toBe('{not-json');
  });

  it('reads an inserted segment shard through an explicit fallback filter', async () => {
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
    const repository = new KnowledgeBaseSegmentShardRepository(database);

    await expect(
      repository.create(
        { knowledgeBaseDocsId: 7, segmentVersion: 3, shardNo: 0 },
        { knowledgeBaseDocsId: 7, segmentVersion: 3, shardNo: 0 },
      ),
    ).resolves.toMatchObject({ id: 42 });
    expect(where).toHaveBeenCalledTimes(3);
  });
});
