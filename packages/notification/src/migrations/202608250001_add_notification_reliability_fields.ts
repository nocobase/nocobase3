import { defineMigration, type MigrationDefinition } from '@nocobase/database';

const migration: MigrationDefinition = defineMigration({
  name: '202608250001_add_notification_reliability_fields',
  async up({ builder, query }) {
    await builder.alterCollection('notifications', (table) => {
      table.string('idempotencyKey', { length: 255 }).nullable();
      table.string('requestHash', { length: 64 }).nullable();
      table.unique(['sourceType', 'idempotencyKey'], {
        name: 'notifications_idempotency_key_unique',
      });
    });
    await builder.alterCollection('notificationDeliveries', (table) => {
      table.string('idempotencyKey', { length: 255 }).nullable();
      table.index(['status', 'nextRunAt', 'createdAt'], {
        name: 'notification_deliveries_ready_idx',
      });
      table.dropIndex('notification_deliveries_pending_idx');
    });
    const deliveries = await query
      .selectFrom<{ readonly id: string }>('notificationDeliveries')
      .select(['id'])
      .execute<{ readonly id: string }>();
    for (const delivery of deliveries) {
      await query
        .updateTable('notificationDeliveries')
        .set({ idempotencyKey: delivery.id })
        .where('id', '=', delivery.id)
        .execute();
    }
    await builder.alterCollection('notificationDeliveries', (table) => {
      table.alterField('idempotencyKey', { nullable: false });
    });
  },
  async down({ builder }) {
    await builder.alterCollection('notificationDeliveries', (table) => {
      table.index(['status', 'createdAt'], {
        name: 'notification_deliveries_pending_idx',
      });
      table.dropIndex('notification_deliveries_ready_idx');
      table.dropField('idempotencyKey');
    });
    await builder.alterCollection('notifications', (table) => {
      table.dropConstraint('notifications_idempotency_key_unique');
      table.dropFields('idempotencyKey', 'requestHash');
    });
  },
});

export default migration;
