import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609200001_notification_channel_names',
  async up({ builder, query }) {
    await builder.alterCollection('notificationDeliveries', (table) => {
      table.string('channelName', { length: 100 }).nullable();
      table.string('channelType', { length: 100 }).nullable();
    });
    const rows = await query
      .selectFrom('notificationDeliveries')
      .select(['id', 'channel'])
      .execute();
    for (const row of rows) {
      await query
        .updateTable('notificationDeliveries')
        .set({ channelName: row.channel, channelType: row.channel })
        .where('id', '=', row.id)
        .execute();
    }
    await builder.alterField('notificationDeliveries', 'channelName', {
      type: 'string',
      length: 100,
      nullable: false,
    });
    await builder.alterField('notificationDeliveries', 'channelType', {
      type: 'string',
      length: 100,
      nullable: false,
    });
    await builder.alterCollection('notificationDeliveries', (table) => {
      table.dropField('channel');
    });
  },
  async down({ builder, query }) {
    await builder.alterCollection('notificationDeliveries', (table) => {
      table.string('channel', { length: 100 }).nullable();
    });
    const rows = await query
      .selectFrom('notificationDeliveries')
      .select(['id', 'channelType'])
      .execute();
    for (const row of rows) {
      await query
        .updateTable('notificationDeliveries')
        .set({ channel: row.channelType })
        .where('id', '=', row.id)
        .execute();
    }
    await builder.alterField('notificationDeliveries', 'channel', {
      type: 'string',
      length: 100,
      nullable: false,
    });
    await builder.alterCollection('notificationDeliveries', (table) => {
      table.dropField('channelName');
      table.dropField('channelType');
    });
  },
});
export default migration;
