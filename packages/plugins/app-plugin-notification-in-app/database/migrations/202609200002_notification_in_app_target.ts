import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609200002_notification_in_app_target',
  async up({ builder }) {
    await builder.alterCollection('notificationInAppItems', (table) => {
      table.json('target').nullable();
    });
  },
  async down({ builder }) {
    await builder.alterCollection('notificationInAppItems', (table) => {
      table.dropField('target');
    });
  },
});
export default migration;
