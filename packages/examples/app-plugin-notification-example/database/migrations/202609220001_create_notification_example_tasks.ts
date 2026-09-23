import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609220001_create_notification_example_tasks',

  async up({ builder }) {
    await builder.createCollection('notificationExampleTasks', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('title', { length: 200 }).notNull();
      collection.text('description').notNull();
      collection.string('status', { length: 32 }).notNull().defaultTo('open');
      collection.string('creatorId', { length: 255 }).notNull();
      collection.string('assigneeId', { length: 255 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('creatorId');
      collection.index('assigneeId');
      collection.index('status');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('notificationExampleTasks');
  },
});

export default migration;
