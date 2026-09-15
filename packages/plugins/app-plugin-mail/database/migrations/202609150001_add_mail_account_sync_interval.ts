import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609150001_add_mail_account_sync_interval',

  async up({ builder }) {
    await builder.alterCollection('mailAccounts', (collection) => {
      collection.integer('automaticSyncIntervalMinutes', {
        nullable: false,
        defaultValue: 5,
      });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('mailAccounts', (collection) => {
      collection.dropField('automaticSyncIntervalMinutes');
    });
  },
});

export default migration;
