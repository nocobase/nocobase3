import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202608310001_replace_ai_file_storage_id_with_disk',
  async up({ builder }: MigrationContext): Promise<void> {
    await builder.alterCollection('aiFiles', (collection) => {
      collection.string('disk').nullable();
      collection.dropField('storageId');
    });
  },
  async down({ builder }: MigrationContext): Promise<void> {
    await builder.alterCollection('aiFiles', (collection) => {
      collection.string('storageId').nullable();
      collection.dropField('disk');
    });
  },
});

export default migration;
