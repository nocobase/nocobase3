import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609030001_create_mail_tables',
  async up({ builder }) {
    await builder.createCollection('mailAccounts', (collection) => {
      collection.uuid('id').primary();
      collection.string('userId', { length: 255, nullable: false });
      collection.string('providerType', { length: 100, nullable: false });
      collection.string('providerName', { length: 255, nullable: false });
      collection.string('address', { length: 320, nullable: false });
      collection.string('displayName', { length: 255 });
      collection.string('credentialReference', {
        length: 500,
        nullable: false,
      });
      collection.string('authorizationSubject', { length: 500 });
      collection.json('scopes', { nullable: false });
      collection.datetime('credentialExpiresAt');
      collection.string('status', { length: 50, nullable: false });
      collection.boolean('isDefault', { nullable: false, defaultValue: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index(['userId', 'status'], {
        name: 'mail_accounts_user_status_idx',
      });
      collection.unique(['providerType', 'providerName', 'address'], {
        name: 'mail_accounts_provider_address_unique',
      });
    });

    await builder.createCollection('mailIdentities', (collection) => {
      collection.uuid('id').primary();
      collection.uuid('accountId', { nullable: false });
      collection.string('address', { length: 320, nullable: false });
      collection.string('displayName', { length: 255 });
      collection.boolean('isPrimary', { nullable: false, defaultValue: false });
      collection.boolean('canSend', { nullable: false, defaultValue: true });
      collection.unique(['accountId', 'address'], {
        name: 'mail_identities_account_address_unique',
      });
    });

    await builder.createCollection('mailFolders', (collection) => {
      collection.uuid('id').primary();
      collection.uuid('accountId', { nullable: false });
      collection.string('providerFolderId', { length: 500, nullable: false });
      collection.string('type', { length: 50, nullable: false });
      collection.string('name', { length: 500, nullable: false });
      collection.integer('unreadCount');
      collection.string('kind', { length: 20, nullable: false });
      collection.unique(['accountId', 'providerFolderId'], {
        name: 'mail_folders_account_provider_unique',
      });
    });

    await builder.createCollection('mailMessages', (collection) => {
      collection.uuid('id').primary();
      collection.uuid('accountId', { nullable: false });
      collection.string('providerMessageId', { length: 500, nullable: false });
      collection.string('internetMessageId', { length: 1000 });
      collection.string('providerConversationId', { length: 500 });
      collection.json('providerFolderIds', { nullable: false });
      collection.json('sender');
      collection.json('recipients', { nullable: false });
      collection.json('replyTo', { nullable: false });
      collection.string('inReplyTo', { length: 1000 });
      collection.json('references', { nullable: false });
      collection.string('subject', { length: 2000, nullable: false });
      collection.text('preview');
      collection.text('text');
      collection.text('html');
      collection.datetime('receivedAt');
      collection.datetime('sentAt');
      collection.boolean('read', { nullable: false, defaultValue: false });
      collection.boolean('starred', { nullable: false, defaultValue: false });
      collection.boolean('draft', { nullable: false, defaultValue: false });
      collection.json('attachments', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['accountId', 'providerMessageId'], {
        name: 'mail_messages_account_provider_unique',
      });
      collection.index(['accountId', 'receivedAt'], {
        name: 'mail_messages_account_received_idx',
      });
    });

    await builder.createCollection('mailSyncStates', (collection) => {
      collection.uuid('accountId').primary();
      collection.json('cursor', { nullable: false });
      collection.datetime('lastSyncedAt', { nullable: false });
    });

    await builder.createCollection('mailSyncRuns', (collection) => {
      collection.uuid('id').primary();
      collection.uuid('accountId', { nullable: false });
      collection.string('requestedBy', { length: 255, nullable: false });
      collection.string('mode', { length: 20, nullable: false });
      collection.string('phase', { length: 20, nullable: false });
      collection.string('status', { length: 20, nullable: false });
      collection.string('activeKey', { length: 255 });
      collection.integer('revision', { nullable: false, defaultValue: 0 });
      collection.json('policy', { nullable: false });
      collection.integer('processedMessages', {
        nullable: false,
        defaultValue: 0,
      });
      collection.integer('processedPages', {
        nullable: false,
        defaultValue: 0,
      });
      collection.text('historyCursor');
      collection.json('baselineCursor');
      collection.json('changeCursor');
      collection.string('leaseToken', { length: 100 });
      collection.datetime('leaseExpiresAt');
      collection.json('error');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.datetime('completedAt');
      collection.index(['accountId', 'status'], {
        name: 'mail_sync_runs_account_status_idx',
      });
      collection.unique('activeKey', {
        name: 'mail_sync_runs_active_account_unique',
      });
    });

    await builder.createCollection('mailSubmissions', (collection) => {
      collection.uuid('id').primary();
      collection.uuid('accountId', { nullable: false });
      collection.string('idempotencyKey', { length: 255, nullable: false });
      collection.string('requestFingerprint', { length: 64, nullable: false });
      collection.string('status', { length: 20, nullable: false });
      collection.string('providerMessageId', { length: 500 });
      collection.json('error');
      collection.string('leaseToken', { length: 100 });
      collection.datetime('leaseExpiresAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index(['status', 'leaseExpiresAt'], {
        name: 'mail_submissions_expired_idx',
      });
      collection.unique(['accountId', 'idempotencyKey'], {
        name: 'mail_submissions_idempotency_unique',
      });
    });

    await builder.createCollection('mailOutbox', (collection) => {
      collection.uuid('id').primary();
      collection.string('type', { length: 50, nullable: false });
      collection.uuid('aggregateId', { nullable: false });
      collection.string('deduplicationKey', { length: 500, nullable: false });
      collection.json('payload', { nullable: false });
      collection.string('status', { length: 20, nullable: false });
      collection.integer('attempts', { nullable: false, defaultValue: 0 });
      collection.datetime('availableAt', { nullable: false });
      collection.string('leaseToken', { length: 100 });
      collection.datetime('leaseExpiresAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('publishedAt');
      collection.unique(['deduplicationKey'], {
        name: 'mail_outbox_deduplication_unique',
      });
      collection.index(['status', 'availableAt'], {
        name: 'mail_outbox_ready_idx',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('mailOutbox');
    await builder.dropCollection('mailSubmissions');
    await builder.dropCollection('mailSyncRuns');
    await builder.dropCollection('mailSyncStates');
    await builder.dropCollection('mailMessages');
    await builder.dropCollection('mailFolders');
    await builder.dropCollection('mailIdentities');
    await builder.dropCollection('mailAccounts');
  },
});

export default migration;
