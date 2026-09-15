import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const MESSAGE_READ_INDEX = 'mail_messages_account_read_sort_idx';
const MESSAGE_STARRED_INDEX = 'mail_messages_account_starred_sort_idx';
const SYNC_RUN_CREATED_INDEX = 'mail_sync_runs_account_created_idx';
const SUBMISSION_CREATED_INDEX = 'mail_submissions_account_created_idx';

const migration: MigrationDefinition = defineMigration({
  name: '202609140005_add_mail_performance_indexes',

  async up({ builder }) {
    await builder.addIndex('mailMessages', {
      fields: ['accountId', 'read', 'sortAt', 'id'],
      name: MESSAGE_READ_INDEX,
    });
    await builder.addIndex('mailMessages', {
      fields: ['accountId', 'starred', 'sortAt', 'id'],
      name: MESSAGE_STARRED_INDEX,
    });
    await builder.addIndex('mailSyncRuns', {
      fields: ['accountId', 'createdAt'],
      name: SYNC_RUN_CREATED_INDEX,
    });
    await builder.addIndex('mailSubmissions', {
      fields: ['accountId', 'createdAt'],
      name: SUBMISSION_CREATED_INDEX,
    });
  },

  async down({ builder }) {
    await builder.dropIndex('mailSubmissions', SUBMISSION_CREATED_INDEX);
    await builder.dropIndex('mailSyncRuns', SYNC_RUN_CREATED_INDEX);
    await builder.dropIndex('mailMessages', MESSAGE_STARRED_INDEX);
    await builder.dropIndex('mailMessages', MESSAGE_READ_INDEX);
  },
});

export default migration;
