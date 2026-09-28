import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609200003_notification_single_provider',
  async up({ builder }) {
    await builder.alterCollection('notificationDeliveries', (table) => {
      table.dropField('providerName');
    });
    await builder.alterCollection('notificationDeliveryAttempts', (table) => {
      table.dropField('providerName');
    });
  },
  async down({ builder, query }) {
    // Removed instance names cannot be recovered; restore the column with the Provider identifier.
    await builder.alterCollection('notificationDeliveries', (table) => {
      table.string('providerName', { length: 191 }).nullable();
    });
    await builder.alterCollection('notificationDeliveryAttempts', (table) => {
      table.string('providerName', { length: 191 }).nullable();
    });
    for (const row of await query
      .selectFrom('notificationDeliveries')
      .select(['id', 'providerType'])
      .execute()) {
      await query
        .updateTable('notificationDeliveries')
        .set({ providerName: row.providerType })
        .where('id', '=', row.id)
        .execute();
    }
    for (const row of await query
      .selectFrom('notificationDeliveryAttempts')
      .select(['id', 'providerType'])
      .execute()) {
      await query
        .updateTable('notificationDeliveryAttempts')
        .set({ providerName: row.providerType })
        .where('id', '=', row.id)
        .execute();
    }
    await builder.alterField('notificationDeliveries', 'providerName', {
      type: 'string',
      length: 191,
      nullable: false,
    });
    await builder.alterField('notificationDeliveryAttempts', 'providerName', {
      type: 'string',
      length: 191,
      nullable: false,
    });
  },
});
export default migration;
