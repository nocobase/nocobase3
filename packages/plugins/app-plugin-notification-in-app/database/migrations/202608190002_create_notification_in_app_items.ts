import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202608190002_create_notification_in_app_items',
  async up({ builder }) {
    await builder.createCollection('notificationInAppItems', (table) => {
      table.string('id', { length: 36 }).primary();
      table.string('deliveryId', { length: 36 }).notNull();
      table.string('notificationId', { length: 36 }).notNull();
      table.string('userId', { length: 191 }).notNull();
      table.string('title', { length: 500 }).nullable();
      table.text('body').notNull();
      table.text('actionUrl').nullable();
      table.datetime('readAt').nullable();
      table.datetime('createdAt').notNull();
      table.datetime('updatedAt').notNull();
      table.unique('deliveryId', {
        name: 'notification_in_app_delivery_unique',
      });
      table.index(['userId', 'readAt', 'createdAt'], {
        name: 'notification_in_app_user_idx',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('notificationInAppItems');
  },
});

export default migration;
