import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609080001_create_notification_idempotency',
  async up({ builder }) {
    await builder.alterCollection('notificationDispatches', (table) => {
      table.string('idempotencyKey', { length: 191 }).nullable();
      table.string('requestFingerprint', { length: 80 }).nullable();
      table.unique('idempotencyKey', {
        name: 'notification_dispatch_idempotency_unique',
      });
    });
    await builder.alterCollection('notificationDeliveryAttempts', (table) => {
      table.json('retryResolution').nullable();
    });
    await builder.alterCollection('notificationDeliveries', (table) => {
      table.json('retryResolution').nullable();
    });
  },
  async down({ builder }) {
    await builder.alterCollection('notificationDeliveries', (table) => {
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
