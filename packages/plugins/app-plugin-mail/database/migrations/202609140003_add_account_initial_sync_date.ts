import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609140003_add_account_initial_sync_date',

  async up({ builder }) {
    await builder.alterCollection('mailAuthorizationStates', (collection) => {
      collection.datetime('initialSyncReceivedAfter');
    });
    await builder.alterCollection('mailAccounts', (collection) => {
      collection.datetime('initialSyncReceivedAfter');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('mailAccounts', (collection) => {
      collection.dropField('initialSyncReceivedAfter');
    });
    await builder.alterCollection('mailAuthorizationStates', (collection) => {
      collection.dropField('initialSyncReceivedAfter');
    });
  },
});

export default migration;
