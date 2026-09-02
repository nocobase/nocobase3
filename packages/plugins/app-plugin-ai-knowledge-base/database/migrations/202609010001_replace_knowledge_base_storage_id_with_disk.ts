import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

const STORAGE_COLLECTIONS = [
  'aiKnowledgeBase',
  'aiKnowledgeBaseDocs',
  'aiKnowledgeBaseDocSegmentShards',
] as const;

const migration: MigrationDefinition = defineMigration({
  name: '202609010001_replace_knowledge_base_storage_id_with_disk',
  async up({ builder }: MigrationContext): Promise<void> {
    for (const collectionName of STORAGE_COLLECTIONS) {
      await builder.alterCollection(collectionName, (collection) => {
        collection.string('disk', { length: 128 }).nullable();
        collection.dropField('storageId');
      });
    }
    await builder.alterCollection(
      'aiKnowledgeBaseDocSegmentShards',
      (collection) => {
        collection.string('extname').nullable();
      },
    );
  },
  async down({ builder }: MigrationContext): Promise<void> {
    await builder.alterCollection(
      'aiKnowledgeBaseDocSegmentShards',
      (collection) => {
        collection.dropField('extname');
      },
    );
    for (const collectionName of [...STORAGE_COLLECTIONS].reverse()) {
      await builder.alterCollection(collectionName, (collection) => {
        collection.string('storageId', { length: 64 }).nullable();
        collection.dropField('disk');
      });
    }
  },
});

export default migration;
