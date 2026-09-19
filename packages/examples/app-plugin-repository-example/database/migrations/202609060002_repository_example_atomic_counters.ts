import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609060002_repository_example_atomic_counters',
  async up({ builder }) {
    await builder.createCollection(
      'repositoryExampleAtomicCounters',
      (collection) => {
        collection.string('id', { length: 64 }).primary().notNull();
        collection.string('name', { length: 120 }).notNull();
        collection.integer('value').notNull().defaultTo(0);
      },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('repositoryExampleAtomicCounters');
  },
});
export default migration;
