import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609080001_create_notification_idempotency',
  async up({ builder, connection }) {
    await builder.alterCollection('notificationDispatches', (table) => {
      table.string('idempotencyKey', { length: 191 }).nullable();
      table.string('requestFingerprint', { length: 80 }).nullable();
      table.unique('idempotencyKey', {
        name: 'notification_dispatch_idempotency_unique',
        ...(connection.capabilities.partialIndexes
          ? { predicate: { idempotencyKey: { $notNull: true } } }
          : {}),
      });
    });
    await builder.alterCollection('notificationDeliveryAttempts', (table) => {
      table.json('retryResolution').nullable();
    });
    await builder.alterCollection('notificationDeliveries', (table) => {
      table.json('retryResolution').nullable();
      table.json('providerIdempotency').nullable();
    });
    await builder.createCollection(
      'notificationDeliveryRetryAudits',
      (table) => {
        table.string('id', { length: 36 }).primary();
        table.string('deliveryId', { length: 36 }).notNull();
        table.json('resolution').notNull();
        table.json('providerIdempotency').nullable();
        table.datetime('createdAt').notNull();
        table.index('deliveryId', {
          name: 'notification_retry_audits_delivery_idx',
        });
      },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('notificationDeliveryRetryAudits');
    await builder.alterCollection('notificationDeliveries', (table) => {
      table.dropField('providerIdempotency');
      table.dropField('retryResolution');
    });
    await builder.alterCollection('notificationDeliveryAttempts', (table) => {
      table.dropField('retryResolution');
    });
    await builder.dropConstraint(
      'notificationDispatches',
      'notification_dispatch_idempotency_unique',
    );
    await builder.alterCollection('notificationDispatches', (table) => {
      table.dropField('requestFingerprint');
      table.dropField('idempotencyKey');
    });
  },
});

export default migration;
