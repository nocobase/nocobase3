import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/app-database';

const migration: MigrationDefinition = defineMigration({
  name: '202608260001_create_ai_knowledge_base',
  async up({ builder }: MigrationContext): Promise<void> {
    await builder.createCollection(
      'aiKnowledgeBase',
      (c) => {
        c.increments('id');
        c.datetime('createdAt').nullable();
        c.datetime('updatedAt').nullable();
        c.string('knowledgeBaseType', { length: 32 }).notNull();
        c.string('knowledgeBaseOuterId', { length: 64 }).notNull();
        c.string('key', { length: 128 }).nullable();
        c.string('name', { length: 64 }).notNull();
        c.string('description', { length: 512 }).nullable();
        c.string('vectorStoreProvider', { length: 128 }).notNull();
        c.string('storageId', { length: 64 }).nullable();
        c.string('vectorStoreConfigKey', { length: 128 }).nullable();
        c.string('vectorStoreConfigId', { length: 64 }).nullable();
        c.datetime('confirmVectorStoreChanged').nullable();
        c.json('vectorStoreProps').nullable();
        c.json('segmentOptions', {
          defaultValue: { enabled: true, chunkSize: 6000, chunkOverlap: 1200 },
        }).notNull();
        c.integer('documentCount', { defaultValue: 0 }).notNull();
        c.integer('characterCount', { defaultValue: 0 }).notNull();
        c.integer('aiEmployeeCount', { defaultValue: 0 }).notNull();
        c.boolean('enabled', { defaultValue: true }).notNull();
        c.unique('key', { name: 'uq_ai_knowledge_base_key' });
      },
      { ifNotExists: true },
    );

    await builder.createCollection(
      'aiKnowledgeBaseDocs',
      (c) => {
        c.increments('id');
        c.datetime('createdAt').nullable();
        c.datetime('updatedAt').nullable();
        c.string('createdById').nullable();
        c.string('updatedById').nullable();
        c.string('key', { length: 128 }).nullable();
        c.string('title').nullable();
        c.string('filename').nullable();
        c.string('extname').nullable();
        c.integer('size').nullable();
        c.string('mimetype').nullable();
        c.text('path').nullable();
        c.text('url').nullable();
        c.text('preview').nullable();
        c.string('storageId').nullable();
        c.json('meta', { defaultValue: {} }).notNull();
        c.string('knowledgeBaseKey', { length: 128 }).nullable();
        c.string('indexStatus', { length: 32 }).notNull();
        c.text('errorMessage').nullable();
        c.integer('characterCount', { defaultValue: 0 }).notNull();
        c.integer('segmentCount', { defaultValue: 0 }).notNull();
        c.integer('segmentVersion').nullable();
        c.integer('segmentRevision', { defaultValue: 0 }).notNull();
        c.string('segmentStatus', { length: 32 }).nullable();
        c.text('segmentErrorMessage').nullable();
        c.datetime('segmentUpdatedAt').nullable();
        c.json('segmentOptions', {
          defaultValue: { enabled: true, chunkSize: 6000, chunkOverlap: 1200 },
        }).notNull();
        c.boolean('enabled', { defaultValue: true }).notNull();
        c.unique('key', { name: 'uq_ai_knowledge_base_docs_key' });
      },
      { ifNotExists: true },
    );

    await builder.createCollection(
      'aiKnowledgeBaseDocSegmentShards',
      (c) => {
        c.increments('id');
        c.datetime('createdAt').nullable();
        c.datetime('updatedAt').nullable();
        c.string('createdById').nullable();
        c.string('updatedById').nullable();
        c.string('knowledgeBaseKey', { length: 128 }).notNull();
        c.integer('knowledgeBaseDocsId').notNull();
        c.integer('shardNo').notNull();
        c.integer('segmentVersion').notNull();
        c.integer('segmentCount').notNull();
        c.string('contentHash', { length: 128 }).notNull();
        c.string('filename').nullable();
        c.text('path').nullable();
        c.text('url').nullable();
        c.integer('size').nullable();
        c.string('mimetype').nullable();
        c.string('storageId').nullable();
        c.json('meta', { defaultValue: {} }).notNull();
        c.unique(['knowledgeBaseDocsId', 'segmentVersion', 'shardNo'], {
          name: 'uq_ai_kb_shard',
        });
        c.index('knowledgeBaseDocsId', { name: 'idx_ai_kb_shard_doc' });
        c.index('knowledgeBaseKey', { name: 'idx_ai_kb_shard_key' });
      },
      { ifNotExists: true },
    );

    await builder.createCollection(
      'aiKnowledgeBaseDocSegments',
      (c) => {
        c.increments('id');
        c.datetime('createdAt').nullable();
        c.datetime('updatedAt').nullable();
        c.string('createdById').nullable();
        c.string('updatedById').nullable();
        c.string('uid', { length: 128 }).notNull();
        c.string('knowledgeBaseKey', { length: 128 }).notNull();
        c.string('knowledgeBaseOuterId', { length: 128 }).nullable();
        c.integer('knowledgeBaseDocsId').notNull();
        c.integer('shardId').notNull();
        c.integer('shardNo').notNull();
        c.string('contentKey', { length: 128 }).notNull();
        c.integer('position').notNull();
        c.string('title').nullable();
        c.text('preview').nullable();
        c.string('contentHash', { length: 128 }).notNull();
        c.integer('charLength').notNull();
        c.integer('questionCount', { defaultValue: 0 }).notNull();
        c.boolean('enabled', { defaultValue: true }).notNull();
        c.integer('segmentVersion').notNull();
        c.json('meta', { defaultValue: {} }).notNull();
        c.unique(['knowledgeBaseDocsId', 'uid'], {
          name: 'uq_ai_kb_segment_doc_uid',
        });
        c.index(['knowledgeBaseDocsId', 'position'], {
          name: 'idx_ai_kb_segment_position',
        });
        c.index('knowledgeBaseKey', { name: 'idx_ai_kb_segment_key' });
        c.index('shardId', { name: 'idx_ai_kb_segment_shard' });
        c.index('enabled', { name: 'idx_ai_kb_segment_enabled' });
      },
      { ifNotExists: true },
    );

    await builder.createCollection(
      'aiVectorDatabases',
      (c) => {
        c.increments('id');
        c.datetime('createdAt').nullable();
        c.datetime('updatedAt').nullable();
        c.string('key', { length: 128 }).nullable();
        c.string('name', { length: 128 }).notNull();
        c.string('databaseSpec', { length: 64 }).notNull();
        c.string('provider', { length: 64 }).notNull();
        c.json('connectProps').notNull();
        c.string('connectPropsHash').nullable();
        c.boolean('enabled', { defaultValue: true }).notNull();
        c.unique('key', { name: 'uq_ai_vector_database_key' });
      },
      { ifNotExists: true },
    );

    await builder.createCollection(
      'aiVectorStoreConfig',
      (c) => {
        c.increments('id');
        c.datetime('createdAt').nullable();
        c.datetime('updatedAt').nullable();
        c.string('key', { length: 128 }).nullable();
        c.string('name', { length: 128 }).notNull();
        c.string('vectorDatabaseKey', { length: 128 }).nullable();
        c.string('vectorDatabaseId').nullable();
        c.string('llmService').nullable();
        c.string('embeddingModel', { length: 128 }).notNull();
        c.boolean('enabled', { defaultValue: true }).notNull();
        c.unique('key', { name: 'uq_ai_vector_store_config_key' });
      },
      { ifNotExists: true },
    );
  },
  async down({ builder }: MigrationContext): Promise<void> {
    await builder.dropCollection('aiVectorStoreConfig');
    await builder.dropCollection('aiVectorDatabases');
    await builder.dropCollection('aiKnowledgeBaseDocSegments');
    await builder.dropCollection('aiKnowledgeBaseDocSegmentShards');
    await builder.dropCollection('aiKnowledgeBaseDocs');
    await builder.dropCollection('aiKnowledgeBase');
  },
});

export default migration;
