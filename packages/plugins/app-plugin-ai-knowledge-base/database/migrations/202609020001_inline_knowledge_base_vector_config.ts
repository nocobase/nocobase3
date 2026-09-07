import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609020001_inline_knowledge_base_vector_config',
  irreversible: true,
  async up({ builder }: MigrationContext): Promise<void> {
    await builder.alterCollection('aiKnowledgeBase', (collection) => {
      collection.string('vectorDatabaseKey', { length: 128 }).nullable();
      collection.string('llmService').nullable();
      collection.string('embeddingModel', { length: 128 }).nullable();
      collection.string('vectorStoreConfigHash', { length: 64 }).nullable();
      collection.datetime('vectorStoreUpdatedAt').nullable();
      collection.dropField('vectorStoreConfigKey');
      collection.dropField('vectorStoreConfigId');
    });
    await builder.dropCollection('aiVectorStoreConfig');
  },
});

export default migration;
