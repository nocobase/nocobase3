import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import createKnowledgeBaseMigration from '../database/migrations/202608260001_create_ai_knowledge_base.js';
import storageMigration from '../database/migrations/202609010001_replace_knowledge_base_storage_id_with_disk.js';
import inlineVectorConfigMigration from '../database/migrations/202609020001_inline_knowledge_base_vector_config.js';
import manifestPersistenceMigration from '../database/migrations/202609050001_create_ai_knowledge_base_manifests.js';

interface SqliteClient {
  readonly schema: {
    hasColumn(table: string, column: string): Promise<boolean>;
    hasTable(table: string): Promise<boolean>;
  };
  raw(
    sql: string,
  ): Promise<readonly { readonly name: string; readonly seqno?: number }[]>;
}

const MANIFEST_TABLE = 'ai_knowledge_base_manifests';
const MANIFEST_FILE_TABLE = 'ai_knowledge_base_manifest_files';

describe('knowledge base manifest persistence migration', () => {
  let database: DatabaseManager;
  let metadataStore: InMemoryCollectionMetadataStore;

  beforeEach(() => {
    metadataStore = new InMemoryCollectionMetadataStore();
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      metadataStore,
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('creates manifest tables, fields, indexes, unique constraints, and metadata', async () => {
    await migrateUp(database);
    const client = await database.connection().client<SqliteClient>();

    await expect(client.schema.hasTable(MANIFEST_TABLE)).resolves.toBe(true);
    await expect(client.schema.hasTable(MANIFEST_FILE_TABLE)).resolves.toBe(
      true,
    );
    await expect(
      Promise.all(
        [
          'id',
          'source_disk',
          'source_location',
          'knowledge_base_key',
          'knowledge_base_id',
          'operation',
          'status',
          'manifest_hash',
          'manifest_snapshot',
          'attempt_count',
          'created_at',
          'updated_at',
          'started_at',
          'finished_at',
          'error_message',
        ].map((column) => client.schema.hasColumn(MANIFEST_TABLE, column)),
      ),
    ).resolves.toEqual(Array.from({ length: 15 }, () => true));
    await expect(
      Promise.all(
        [
          'id',
          'manifest_record_id',
          'source_disk',
          'source_location',
          'knowledge_base_key',
          'content_hash',
          'document_id',
          'document_key',
          'status',
          'attempt_count',
          'created_at',
          'updated_at',
          'failure_reason',
        ].map((column) => client.schema.hasColumn(MANIFEST_FILE_TABLE, column)),
      ),
    ).resolves.toEqual(Array.from({ length: 13 }, () => true));
    await expect(
      client.schema.hasColumn('ai_vector_databases', 'managed_by'),
    ).resolves.toBe(true);
    await database
      .query()
      .insertInto('aiVectorDatabases')
      .values({
        key: 'manual-vector-database',
        name: 'Manual vector database',
        databaseSpec: 'PGVector',
        provider: 'NocobaseDefaultPGVectorProvider',
        connectProps: '{}',
        enabled: true,
      })
      .execute();
    await expect(
      database
        .query()
        .selectFrom('aiVectorDatabases')
        .select(['managedBy'])
        .executeTakeFirst<{ managedBy: string | null }>(),
    ).resolves.toEqual({ managedBy: null });

    await expect(
      client.raw(`PRAGMA index_list(${MANIFEST_TABLE})`),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'uq_ai_kb_manifest_source' }),
        expect.objectContaining({ name: 'idx_ai_kb_manifest_status' }),
      ]),
    );
    await expect(
      client.raw(`PRAGMA index_list(${MANIFEST_FILE_TABLE})`),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'uq_ai_kb_manifest_file_source' }),
        expect.objectContaining({ name: 'idx_ai_kb_manifest_file_recovery' }),
      ]),
    );
    await expect(
      indexColumns(client, 'idx_ai_kb_manifest_status'),
    ).resolves.toEqual(['status']);
    await expect(
      indexColumns(client, 'uq_ai_kb_manifest_source'),
    ).resolves.toEqual(['source_disk', 'source_location']);
    await expect(
      indexColumns(client, 'idx_ai_kb_manifest_file_recovery'),
    ).resolves.toEqual([
      'knowledge_base_key',
      'source_disk',
      'source_location',
    ]);
    await expect(
      indexColumns(client, 'uq_ai_kb_manifest_file_source'),
    ).resolves.toEqual([
      'manifest_record_id',
      'source_disk',
      'source_location',
    ]);

    const now = '2026-09-05T00:00:00.000Z';
    const parent = {
      sourceDisk: 'local',
      sourceLocation: 'preload/manifest.yml',
      knowledgeBaseKey: 'manuals',
      knowledgeBaseId: 42,
      operation: 'init',
      status: 'PENDING',
      manifestHash: 'a'.repeat(64),
      manifestSnapshot: JSON.stringify({
        key: 'manuals',
        operation: 'init',
        initiate: {
          disk: 'local',
          name: 'Manuals',
          vectorDatabase: 'vector-database',
          llmService: 'llm-service',
          embeddingModel: 'embedding-model',
        },
        files: [{ disk: 'local', locations: ['preload/manual.pdf'] }],
      }),
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await database
      .query()
      .insertInto('aiKnowledgeBaseManifests')
      .values(parent)
      .execute();
    await expect(
      database
        .query()
        .insertInto('aiKnowledgeBaseManifests')
        .values({ ...parent, knowledgeBaseKey: 'other' })
        .execute(),
    ).rejects.toThrow(/unique/i);

    const manifest = await database
      .query()
      .selectFrom('aiKnowledgeBaseManifests')
      .select(['id', 'knowledgeBaseId'])
      .executeTakeFirst<{
        id: string | number;
        knowledgeBaseId: string | number | null;
      }>();
    if (!manifest) throw new Error('Manifest fixture was not persisted');
    expect(Number(manifest.knowledgeBaseId)).toBe(42);
    const file = {
      manifestRecordId: manifest.id,
      sourceDisk: 'local',
      sourceLocation: 'preload/manual.pdf',
      knowledgeBaseKey: 'manuals',
      status: 'PENDING',
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await database
      .query()
      .insertInto('aiKnowledgeBaseManifestFiles')
      .values(file)
      .execute();
    await expect(
      database
        .query()
        .insertInto('aiKnowledgeBaseManifestFiles')
        .values({ ...file, knowledgeBaseKey: 'other' })
        .execute(),
    ).rejects.toThrow(/unique/i);

    await expect(
      metadataStore.get('aiKnowledgeBaseManifests'),
    ).resolves.toMatchObject({
      document: {
        fields: {
          knowledgeBaseId: { type: 'integer' },
          manifestSnapshot: { type: 'json' },
        },
      },
    });
    await expect(
      metadataStore.get('aiKnowledgeBaseManifestFiles'),
    ).resolves.toMatchObject({
      document: {
        fields: {
          manifestRecordId: { type: 'integer' },
          contentHash: { type: 'string' },
          documentId: { type: 'integer' },
          documentKey: { type: 'string' },
        },
      },
    });
    await expect(metadataStore.get('aiVectorDatabases')).resolves.toMatchObject(
      {
        document: {
          fields: { managedBy: { type: 'string' } },
        },
      },
    );
  });

  it('reverses the tables, metadata, and managedBy field', async () => {
    await migrateUp(database);
    await migrateDown(database);
    const client = await database.connection().client<SqliteClient>();

    await expect(client.schema.hasTable(MANIFEST_FILE_TABLE)).resolves.toBe(
      false,
    );
    await expect(client.schema.hasTable(MANIFEST_TABLE)).resolves.toBe(false);
    await expect(
      client.schema.hasColumn('ai_vector_databases', 'managed_by'),
    ).resolves.toBe(false);
    await expect(
      metadataStore.get('aiKnowledgeBaseManifestFiles'),
    ).resolves.toBeUndefined();
    await expect(
      metadataStore.get('aiKnowledgeBaseManifests'),
    ).resolves.toBeUndefined();
    const vectorDatabaseMetadata = await metadataStore.get('aiVectorDatabases');
    expect(
      vectorDatabaseMetadata?.document.fields
        ? Object.keys(vectorDatabaseMetadata.document.fields)
        : [],
    ).not.toContain('managedBy');
  });
});

async function indexColumns(
  client: SqliteClient,
  index: string,
): Promise<string[]> {
  const rows = await client.raw(`PRAGMA index_info(${index})`);
  return [...rows]
    .sort((left, right) => (left.seqno ?? 0) - (right.seqno ?? 0))
    .map(({ name }) => name);
}

async function migrateUp(database: DatabaseManager): Promise<void> {
  await database.connect();
  const connection = database.connection();
  const context = {
    builder: connection.builder,
    query: connection.query,
    connection,
  };
  await createKnowledgeBaseMigration.up(context);
  await storageMigration.up(context);
  await inlineVectorConfigMigration.up(context);
  await manifestPersistenceMigration.up(context);
}

async function migrateDown(database: DatabaseManager): Promise<void> {
  const connection = database.connection();
  await manifestPersistenceMigration.down?.({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
}
