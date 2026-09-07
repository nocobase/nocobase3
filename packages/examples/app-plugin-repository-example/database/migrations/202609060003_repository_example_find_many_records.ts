import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609060003_repository_example_find_many_records',
  async up({ builder }) {
    await builder.createCollection(
      'repositoryExampleFindManyRecords',
      (collection) => {
        collection.string('id', { length: 64 }).primary().notNull();
        collection.integer('sequence').notNull();
        collection.string('title', { length: 120 }).notNull();
        collection
          .enum('category', { values: ['alpha', 'beta', 'gamma'] })
          .notNull();
        collection.string('description', { length: 255 }).notNull();
        collection.unique(['sequence']);
      },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('repositoryExampleFindManyRecords');
  },
});

export default migration;
