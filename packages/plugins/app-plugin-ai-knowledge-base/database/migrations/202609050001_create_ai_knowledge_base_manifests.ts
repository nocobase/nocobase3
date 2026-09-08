import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609050001_create_ai_knowledge_base_manifests',
  async up({ builder }: MigrationContext): Promise<void> {
    await builder.alterCollection('aiVectorDatabases', (collection) => {
      collection.string('managedBy', { length: 32 }).nullable();
    });

    await builder.createCollection('aiKnowledgeBaseManifests', (collection) => {
      collection.increments('id');
      collection.string('sourceDisk', { length: 128 }).notNull();
      collection.string('sourceLocation', { length: 512 }).notNull();
      collection.string('knowledgeBaseKey', { length: 128 }).notNull();
      collection.integer('knowledgeBaseId').nullable();
      collection.string('operation', { length: 32 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.string('manifestHash', { length: 64 }).notNull();
      collection.json('manifestSnapshot').notNull();
      collection.integer('attemptCount', { defaultValue: 0 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.datetime('startedAt').nullable();
      collection.datetime('finishedAt').nullable();
      collection.text('errorMessage').nullable();
      collection.unique(['sourceDisk', 'sourceLocation'], {
        name: 'uq_ai_kb_manifest_source',
      });
      collection.index('status', { name: 'idx_ai_kb_manifest_status' });
    });

    await builder.createCollection(
      'aiKnowledgeBaseManifestFiles',
      (collection) => {
        collection.increments('id');
        collection.integer('manifestRecordId').notNull();
        collection.string('sourceDisk', { length: 128 }).notNull();
        collection.string('sourceLocation', { length: 512 }).notNull();
        collection.string('knowledgeBaseKey', { length: 128 }).notNull();
        collection.string('contentHash', { length: 64 }).nullable();
        collection.integer('documentId').nullable();
        collection.string('documentKey', { length: 128 }).nullable();
        collection.string('status', { length: 32 }).notNull();
        collection.integer('attemptCount', { defaultValue: 0 }).notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.text('failureReason').nullable();
        collection.unique(
          ['manifestRecordId', 'sourceDisk', 'sourceLocation'],
          {
            name: 'uq_ai_kb_manifest_file_source',
          },
        );
        collection.index(['knowledgeBaseKey', 'sourceDisk', 'sourceLocation'], {
          name: 'idx_ai_kb_manifest_file_recovery',
        });
      },
    );
  },
  async down({ builder }: MigrationContext): Promise<void> {
    await builder.dropCollection('aiKnowledgeBaseManifestFiles');
    await builder.dropCollection('aiKnowledgeBaseManifests');
    await builder.alterCollection('aiVectorDatabases', (collection) => {
      collection.dropField('managedBy');
    });
  },
});

export default migration;
