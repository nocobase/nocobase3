import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609150001_authorization_example_create_tasks',

  async up({ builder }) {
    await builder.createCollection(
      'authorizationExampleTasks',
      (collection) => {
        collection.increments('id');
        collection.string('title', { length: 255, nullable: false });
        collection.enum('status', {
          values: ['open', 'done'],
          nullable: false,
          defaultValue: 'open',
        });
        // `recordsIOwn` compares this column; it is stamped from the principal.
        collection.string('ownerId', { length: 64, nullable: false });
        // `datetimeTz`, so the page can send an instant back as plain ISO-8601.
        collection.datetimeTz('createdAt', { nullable: false });
        collection.datetimeTz('updatedAt', { nullable: false });
        collection.index('ownerId');
      },
    );
  },

  async down({ builder }) {
    await builder.dropCollection('authorizationExampleTasks');
  },
});

export default migration;
