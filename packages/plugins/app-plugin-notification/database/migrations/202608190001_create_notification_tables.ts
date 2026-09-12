import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202608190001_create_notification_tables',
  async up({ builder }) {
    await builder.createCollection('notificationDispatches', (table) => {
      table.string('id', { length: 36 }).primary();
      table.string('sourceType', { length: 100 }).notNull();
      table.string('sourceReferenceId', { length: 191 }).nullable();
      table.datetime('createdAt').notNull();
      table.datetime('updatedAt').notNull();
    });
    await builder.createCollection('notificationDeliveries', (table) => {
      table.string('id', { length: 36 }).primary();
      table.string('notificationId', { length: 36 }).notNull();
      table.string('channel', { length: 100 }).notNull();
      table.json('recipientSnapshot').notNull();
      table.json('messageSnapshot').notNull();
      table.string('providerName', { length: 191 }).notNull();
      table.string('providerType', { length: 100 }).notNull();
      table.integer('attemptCount').notNull().defaultTo(0);
      table.string('status', { length: 32 }).notNull();
      table.datetime('nextRunAt').nullable();
      table.string('leaseToken', { length: 100 }).nullable();
      table.datetime('leaseExpiresAt').nullable();
      table.json('lastError').nullable();
      table.datetime('createdAt').notNull();
      table.datetime('updatedAt').notNull();
      table.index('notificationId', {
        name: 'notification_deliveries_notification_idx',
      });
      table.index(['status', 'nextRunAt', 'createdAt'], {
        name: 'notification_deliveries_ready_idx',
      });
    });
    await builder.createCollection('notificationDeliveryAttempts', (table) => {
      table.string('id', { length: 36 }).primary();
      table.string('deliveryId', { length: 36 }).notNull();
      table.integer('sequence').notNull();
      table.string('providerName', { length: 191 }).notNull();
      table.string('providerType', { length: 100 }).notNull();
      table.string('status', { length: 32 }).notNull();
      table.datetime('startedAt').notNull();
      table.datetime('finishedAt').nullable();
      table.string('providerMessageId', { length: 191 }).nullable();
      table.string('errorCategory', { length: 64 }).nullable();
      table.string('errorCode', { length: 191 }).nullable();
      table.text('errorMessage').nullable();
      table.index('deliveryId', {
        name: 'notification_attempts_delivery_idx',
      });
      table.unique(['deliveryId', 'sequence'], {
        name: 'notification_attempt_sequence_unique',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('notificationDeliveryAttempts');
    await builder.dropCollection('notificationDeliveries');
    await builder.dropCollection('notificationDispatches');
  },
});

export default migration;
