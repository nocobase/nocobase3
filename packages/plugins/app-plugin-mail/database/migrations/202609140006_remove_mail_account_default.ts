import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const ACCOUNT_DEFAULT_UNIQUE = 'mail_accounts_default_user_unique';

const migration: MigrationDefinition = defineMigration({
  name: '202609140006_remove_mail_account_default',

  async up({ builder }) {
    await builder.alterCollection('mailAccounts', (collection) => {
      collection.dropConstraint(ACCOUNT_DEFAULT_UNIQUE);
    });
    await builder.alterCollection('mailAccounts', (collection) => {
      collection.dropField('defaultForUserId');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('mailAccounts', (collection) => {
      collection.string('defaultForUserId', { length: 255 });
      collection.unique('defaultForUserId', {
        name: ACCOUNT_DEFAULT_UNIQUE,
      });
    });
  },
});

export default migration;
