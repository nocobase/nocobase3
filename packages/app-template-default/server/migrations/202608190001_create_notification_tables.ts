import { defineMigration } from '@nocobase/database';

const id = { length: 36, nullable: false } as const;
const timestamp = { nullable: false } as const;

export default defineMigration({
  name: '202608190001_create_notification_tables',

  async up({ builder }) {
    await builder.createCollection('notifications', (collection) => {
      collection.string('id', id).primary();
      collection.string('sourceType', { length: 100, nullable: false });
      collection.string('sourceReferenceId', { length: 191, nullable: true });
      collection.string('principalService', { length: 191, nullable: false });
      collection.datetime('triggeredAt', timestamp);
      collection.string('messageMode', { length: 32, nullable: false });
      collection.string('templateName', { length: 191, nullable: true });
      collection.string('templateVersion', { length: 100, nullable: true });
      collection.string('summaryStatus', { length: 32, nullable: false });
      collection.integer('version', { nullable: false, defaultValue: 1 });
      collection.datetime('createdAt', timestamp);
      collection.datetime('updatedAt', timestamp);
      collection.index(['sourceType', 'triggeredAt'], { name: 'notifications_source_triggered_idx' });
    });

    await builder.createCollection('notificationDeliveries', (collection) => {
      collection.string('id', id).primary();
      collection.string('notificationId', id);
      collection.string('channel', { length: 32, nullable: false });
      collection.string('recipientKey', { length: 255, nullable: false });
      collection.json('recipientSnapshot', { nullable: false });
      collection.integer('recipientSchemaVersion', { nullable: false, defaultValue: 1 });
      collection.json('contentSnapshot', { nullable: false });
      collection.integer('contentSchemaVersion', { nullable: false, defaultValue: 1 });
      collection.json('providerChainSnapshot', { nullable: false });
      collection.integer('providerChainSchemaVersion', { nullable: false, defaultValue: 1 });
      collection.integer('providerCursor', { nullable: false, defaultValue: 0 });
      collection.integer('currentAttempt', { nullable: false, defaultValue: 0 });
      collection.string('status', { length: 32, nullable: false });
      collection.datetime('statusChangedAt', timestamp);
      collection.datetime('nextRunAt', { nullable: true });
      collection.string('leaseToken', { length: 100, nullable: true });
      collection.string('leaseOwner', { length: 191, nullable: true });
      collection.datetime('leaseExpiresAt', { nullable: true });
      collection.integer('version', { nullable: false, defaultValue: 1 });
      collection.string('lastAttemptId', { length: 36, nullable: true });
      collection.json('lastError', { nullable: true });
      collection.datetime('createdAt', timestamp);
      collection.datetime('updatedAt', timestamp);
      collection.foreignKey('notificationId', { references: { collection: 'notifications', fields: ['id'] }, onDelete: 'restrict' });
      collection.unique(['notificationId', 'channel', 'recipientKey'], { name: 'notification_delivery_recipient_unique' });
      collection.index(['status', 'nextRunAt'], { name: 'notification_deliveries_due_idx' });
      collection.index(['leaseExpiresAt'], { name: 'notification_deliveries_lease_idx' });
    });

    await builder.createCollection('notificationDeliveryAttempts', (collection) => {
      collection.string('id', id).primary();
      collection.string('deliveryId', id);
      collection.integer('attemptSequence', { nullable: false });
      collection.string('providerInstance', { length: 191, nullable: false });
      collection.string('providerType', { length: 100, nullable: false });
      collection.string('configRevision', { length: 100, nullable: true });
      collection.string('status', { length: 32, nullable: false });
      collection.datetime('startedAt', timestamp);
      collection.datetime('invocationStartedAt', { nullable: true });
      collection.datetime('finishedAt', { nullable: true });
      collection.string('providerMessageId', { length: 191, nullable: true });
      collection.string('errorPhase', { length: 64, nullable: true });
      collection.string('errorCategory', { length: 64, nullable: true });
      collection.string('errorCode', { length: 191, nullable: true });
      collection.text('errorMessage', { nullable: true });
      collection.json('metadata', { nullable: true });
      collection.integer('metadataSchemaVersion', { nullable: false, defaultValue: 1 });
      collection.datetime('createdAt', timestamp);
      collection.datetime('updatedAt', timestamp);
      collection.foreignKey('deliveryId', { references: { collection: 'notificationDeliveries', fields: ['id'] }, onDelete: 'restrict' });
      collection.unique(['deliveryId', 'attemptSequence'], { name: 'notification_attempt_sequence_unique' });
    });

    await builder.createCollection('notificationDeliveryStatusEvents', (collection) => {
      collection.string('id', id).primary();
      collection.string('deliveryId', id);
      collection.integer('sequence', { nullable: false });
      collection.string('fromStatus', { length: 32, nullable: true });
      collection.string('toStatus', { length: 32, nullable: false });
      collection.string('attemptId', { length: 36, nullable: true });
      collection.string('reason', { length: 191, nullable: true });
      collection.string('actor', { length: 191, nullable: true });
      collection.datetime('occurredAt', timestamp);
      collection.json('metadata', { nullable: true });
      collection.integer('metadataSchemaVersion', { nullable: false, defaultValue: 1 });
      collection.foreignKey('deliveryId', { references: { collection: 'notificationDeliveries', fields: ['id'] }, onDelete: 'restrict' });
      collection.unique(['deliveryId', 'sequence'], { name: 'notification_status_event_sequence_unique' });
    });

    await builder.createCollection('userNotificationItems', (collection) => {
      collection.string('id', id).primary();
      collection.string('deliveryId', id);
      collection.string('notificationId', id);
      collection.string('userId', { length: 191, nullable: false });
      collection.string('channel', { length: 32, nullable: false });
      collection.datetime('availableAt', { nullable: true });
      collection.datetime('readAt', { nullable: true });
      collection.datetime('deletedAt', { nullable: true });
      collection.datetime('createdAt', timestamp);
      collection.datetime('updatedAt', timestamp);
      collection.integer('version', { nullable: false, defaultValue: 1 });
      collection.foreignKey('deliveryId', { references: { collection: 'notificationDeliveries', fields: ['id'] }, onDelete: 'restrict' });
      collection.foreignKey('notificationId', { references: { collection: 'notifications', fields: ['id'] }, onDelete: 'restrict' });
      collection.unique(['deliveryId'], { name: 'user_notification_delivery_unique' });
      collection.unique(['notificationId', 'userId', 'channel'], { name: 'user_notification_scope_unique' });
      collection.index(['userId', 'channel', 'availableAt', 'deletedAt', 'createdAt'], { name: 'user_notification_inbox_idx' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('userNotificationItems');
    await builder.dropCollection('notificationDeliveryStatusEvents');
    await builder.dropCollection('notificationDeliveryAttempts');
    await builder.dropCollection('notificationDeliveries');
    await builder.dropCollection('notifications');
  },
});
