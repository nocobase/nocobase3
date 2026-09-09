import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609030001_create_mail_tables',
  async up({ builder }) {
    await builder.createCollection('mailCredentials', (collection) => {
      collection
        .string('reference', { length: 100, nullable: false })
        .primary();
      collection.text('value', { nullable: false });
      collection.string('purpose', {
        length: 30,
        nullable: false,
        defaultValue: 'account',
      });
      collection.datetime('expiresAt');
      collection.string('refreshLeaseToken', { length: 100 });
      collection.datetime('refreshLeaseExpiresAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('expiresAt', {
        name: 'mail_credentials_expiry_idx',
      });
    });

    await builder.createCollection('mailOutboundAttachments', (collection) => {
      collection.uuid('id').primary();
      collection.string('userId', { length: 255, nullable: false });
      collection.string('disk', { length: 100, nullable: false });
      collection.string('key', { length: 1000, nullable: false });
      collection.string('fileName', { length: 500, nullable: false });
      collection.string('contentType', { length: 255, nullable: false });
      collection.integer('size', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('expiresAt', { nullable: false });
      collection.index('expiresAt', {
        name: 'mail_outbound_attachments_expiry_idx',
      });
      collection.unique(['disk', 'key'], {
        name: 'mail_outbound_attachments_disk_key_unique',
      });
    });

    await builder.createCollection('mailTemplates', (collection) => {
      collection.uuid('id').primary();
      collection.string('name', { length: 255, nullable: false });
      collection.string('subject', { length: 2000, nullable: false });
      collection.text('text');
      collection.text('html');
      collection.string('ownerId', { length: 255, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['ownerId', 'name'], {
        name: 'mail_templates_owner_name_unique',
      });
    });

    await builder.createCollection('mailAuthorizationStates', (collection) => {
      collection.string('stateHash', { length: 64, nullable: false }).primary();
      collection.string('userId', { length: 255, nullable: false });
      collection.string('providerType', { length: 100, nullable: false });
      collection.string('providerName', { length: 255, nullable: false });
      collection.string('redirectUri', { length: 2000, nullable: false });
      collection.string('verifierCredentialReference', {
        length: 100,
        nullable: false,
      });
      collection.json('scopes', { nullable: false });
      collection.datetime('expiresAt', { nullable: false });
      collection.datetime('consumedAt');
      collection.datetime('createdAt', { nullable: false });
      collection.index(['expiresAt', 'consumedAt'], {
        name: 'mail_authorization_states_expiry_idx',
      });
    });

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
      collection.string('authorizationSubject', { length: 255 });
      collection.json('scopes', { nullable: false });
      collection.string('status', { length: 50, nullable: false });
      collection.string('defaultForUserId', { length: 255 });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index(['userId', 'status'], {
        name: 'mail_accounts_user_status_idx',
      });
      collection.unique(['providerType', 'providerName', 'address'], {
        name: 'mail_accounts_provider_address_unique',
      });
      collection.unique(
        ['providerType', 'providerName', 'authorizationSubject'],
        { name: 'mail_accounts_provider_subject_unique' },
      );
      collection.unique('defaultForUserId', {
        name: 'mail_accounts_default_user_unique',
      });
    });

    await builder.createCollection('mailPushSubscriptions', (collection) => {
      collection.uuid('accountId').primary();
      collection.string('providerType', { length: 100, nullable: false });
      collection.string('providerName', { length: 255, nullable: false });
      collection.string('providerSubscriptionId', {
        length: 1000,
      });
      collection.string('configurationFingerprint', { length: 64 });
      collection.datetime('renewAfter');
      collection.datetime('expiresAt');
      collection.string('leaseToken', { length: 100 });
      collection.datetime('leaseExpiresAt');
      collection.datetime('updatedAt', { nullable: false });
      collection
        .belongsTo('account', 'mailAccounts')
        .targetKey('id')
        .foreignKey('accountId')
        .constraints(true)
        .onDelete('cascade');
      collection.unique(
        ['providerType', 'providerName', 'providerSubscriptionId'],
        { name: 'mail_push_subscriptions_provider_unique' },
      );
      collection.index('renewAfter', {
        name: 'mail_push_subscriptions_renew_idx',
      });
    });

    await builder.createCollection('mailPushPending', (collection) => {
      collection.uuid('accountId').primary();
      collection.string('requestToken', { length: 100, nullable: false });
      collection.datetime('requestedAt', { nullable: false });
      collection
        .belongsTo('account', 'mailAccounts')
        .targetKey('id')
        .foreignKey('accountId')
        .constraints(true)
        .onDelete('cascade');
    });

    await builder.createCollection('mailIdentities', (collection) => {
      collection.uuid('id').primary();
      collection.uuid('accountId', { nullable: false });
      collection.string('address', { length: 320, nullable: false });
      collection.string('displayName', { length: 255 });
      collection.uuid('primaryForAccountId');
      collection.boolean('canSend', { nullable: false, defaultValue: true });
      collection.unique(['accountId', 'address'], {
        name: 'mail_identities_account_address_unique',
      });
      collection.unique('primaryForAccountId', {
        name: 'mail_identities_primary_account_unique',
      });
      collection
        .belongsTo('account', 'mailAccounts')
        .targetKey('id')
        .foreignKey('accountId')
        .constraints(true)
        .onDelete('cascade');
    });

    await builder.createCollection('mailSignatures', (collection) => {
      collection.uuid('id').primary();
      collection.uuid('identityId', { nullable: false });
      collection.string('name', { length: 255, nullable: false });
      collection.text('text', { nullable: false });
      collection.text('html');
      collection.uuid('defaultForIdentityId');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['identityId', 'name'], {
        name: 'mail_signatures_identity_name_unique',
      });
      collection.unique('defaultForIdentityId', {
        name: 'mail_signatures_default_identity_unique',
      });
      collection
        .belongsTo('identity', 'mailIdentities')
        .targetKey('id')
        .foreignKey('identityId')
        .constraints(true)
        .onDelete('cascade');
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
      collection
        .belongsTo('account', 'mailAccounts')
        .targetKey('id')
        .foreignKey('accountId')
        .constraints(true)
        .onDelete('cascade');
    });

    await builder.createCollection('mailMessages', (collection) => {
      collection.uuid('id').primary();
      collection.uuid('accountId', { nullable: false });
      collection.string('providerMessageId', { length: 500, nullable: false });
      collection.string('providerDraftId', { length: 500 });
      collection.string('internetMessageId', { length: 1000 });
      collection.string('providerConversationId', { length: 500 });
      collection.json('sender');
      collection.json('recipients', { nullable: false });
      collection.json('replyTo', { nullable: false });
      collection.string('inReplyTo', { length: 1000 });
      collection.json('references', { nullable: false });
      collection.string('subject', { length: 2000, nullable: false });
      collection.text('preview');
      collection.text('text');
      collection.text('html');
      collection.text('note');
      collection.datetime('receivedAt');
      collection.datetime('sentAt');
      collection.datetime('sortAt', { nullable: false });
      collection.boolean('read', { nullable: false, defaultValue: false });
      collection.boolean('starred', { nullable: false, defaultValue: false });
      collection.boolean('draft', { nullable: false, defaultValue: false });
      collection.boolean('todo', { nullable: false, defaultValue: false });
      collection.json('attachments', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['accountId', 'providerMessageId'], {
        name: 'mail_messages_account_provider_unique',
      });
      collection.index(['accountId', 'sortAt', 'id'], {
        name: 'mail_messages_account_sort_idx',
      });
      collection.index(['accountId', 'todo', 'sortAt'], {
        name: 'mail_messages_account_todo_sort_idx',
      });
      collection.index(
        ['accountId', 'providerConversationId', 'sortAt', 'id'],
        {
          name: 'mail_messages_account_conversation_idx',
        },
      );
      collection
        .belongsTo('account', 'mailAccounts')
        .targetKey('id')
        .foreignKey('accountId')
        .constraints(true)
        .onDelete('cascade');
    });

    await builder.createCollection('mailMessageFolders', (collection) => {
      collection.uuid('accountId', { nullable: false });
      collection.uuid('messageId', { nullable: false });
      collection.string('providerFolderId', { length: 500, nullable: false });
      collection.primary(['messageId', 'providerFolderId'], {
        name: 'mail_message_folders_pk',
      });
      collection.index(['accountId', 'providerFolderId', 'messageId'], {
        name: 'mail_message_folders_account_folder_idx',
      });
      collection
        .belongsTo('account', 'mailAccounts')
        .targetKey('id')
        .foreignKey('accountId')
        .constraints(true)
        .onDelete('cascade');
      collection
        .belongsTo('message', 'mailMessages')
        .targetKey('id')
        .foreignKey('messageId')
        .constraints(true)
        .onDelete('cascade');
    });

    await builder.createCollection('mailSyncStates', (collection) => {
      collection.uuid('accountId').primary();
      collection.json('cursor', { nullable: false });
      collection.datetime('lastSyncedAt', { nullable: false });
      collection
        .belongsTo('account', 'mailAccounts')
        .targetKey('id')
        .foreignKey('accountId')
        .constraints(true)
        .onDelete('cascade');
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
      collection.text('folderCursor');
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
      collection
        .belongsTo('account', 'mailAccounts')
        .targetKey('id')
        .foreignKey('accountId')
        .constraints(true)
        .onDelete('cascade');
    });

    await builder.createCollection('mailSubmissions', (collection) => {
      collection.uuid('id').primary();
      collection.uuid('accountId', { nullable: false });
      collection.string('idempotencyKey', { length: 255, nullable: false });
      collection.string('requestFingerprint', { length: 64, nullable: false });
      collection.string('status', { length: 20, nullable: false });
      collection.string('providerMessageId', { length: 500 });
      collection.datetime('scheduledAt');
      collection.string('requestedBy', { length: 255 });
      collection.json('composeInput');
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
      collection
        .belongsTo('account', 'mailAccounts')
        .targetKey('id')
        .foreignKey('accountId')
        .constraints(true)
        .onDelete('cascade');
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
      collection.index(['status', 'publishedAt'], {
        name: 'mail_outbox_retention_idx',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('mailOutbox');
    await builder.dropCollection('mailSubmissions');
    await builder.dropCollection('mailSyncRuns');
    await builder.dropCollection('mailSyncStates');
    await builder.dropCollection('mailMessageFolders');
    await builder.dropCollection('mailMessages');
    await builder.dropCollection('mailFolders');
    await builder.dropCollection('mailSignatures');
    await builder.dropCollection('mailIdentities');
    await builder.dropCollection('mailPushPending');
    await builder.dropCollection('mailPushSubscriptions');
    await builder.dropCollection('mailAccounts');
    await builder.dropCollection('mailAuthorizationStates');
    await builder.dropCollection('mailTemplates');
    await builder.dropCollection('mailOutboundAttachments');
    await builder.dropCollection('mailCredentials');
  },
});

export default migration;
