import { resolve } from 'node:path';

import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface SqliteClient {
  readonly schema: {
    hasTable(name: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
  raw(sql: string): Promise<readonly { readonly name: string }[]>;
}

const COLLECTIONS = [
  ['mailCredentials', 'mail_credentials'],
  ['mailOutboundAttachments', 'mail_outbound_attachments'],
  ['mailTemplates', 'mail_templates'],
  ['mailAuthorizationStates', 'mail_authorization_states'],
  ['mailAccounts', 'mail_accounts'],
  ['mailPushSubscriptions', 'mail_push_subscriptions'],
  ['mailPushPending', 'mail_push_pending'],
  ['mailIdentities', 'mail_identities'],
  ['mailFolders', 'mail_folders'],
  ['mailMessages', 'mail_messages'],
  ['mailMessageFolders', 'mail_message_folders'],
  ['mailSyncStates', 'mail_sync_states'],
  ['mailSyncRuns', 'mail_sync_runs'],
  ['mailSyncTombstones', 'mail_sync_tombstones'],
  ['mailSubmissions', 'mail_submissions'],
  ['mailOutbox', 'mail_outbox'],
  ['mailSignatures', 'mail_signatures'],
  ['mailLabels', 'mail_labels'],
  ['mailMessageLabels', 'mail_message_labels'],
] as const;
const MIGRATIONS_DIRECTORY = resolve(process.cwd(), 'database/migrations');

describe('mail database migration', () => {
  let database: DatabaseManager;
  let metadataStore: InMemoryCollectionMetadataStore;

  beforeEach(() => {
    metadataStore = new InMemoryCollectionMetadataStore();
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      metadataStore,
      connections: {
        main: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('creates the complete mail schema', async () => {
    const result = await migrateUp(database);
    expect(result.executed).toEqual([
      '202609030001_create_mail_tables',
      '202609170001_add_mail_address_search',
    ]);

    const client = await database.connection().client<SqliteClient>();
    await expect(
      Promise.all(
        COLLECTIONS.map(([, table]) => client.schema.hasTable(table)),
      ),
    ).resolves.toEqual(COLLECTIONS.map(() => true));

    await expect(
      Promise.all([
        client.schema.hasColumn(
          'mail_authorization_states',
          'initial_sync_received_after',
        ),
        client.schema.hasColumn('mail_accounts', 'initial_sync_received_after'),
        client.schema.hasColumn(
          'mail_accounts',
          'automatic_sync_interval_minutes',
        ),
        client.schema.hasColumn('mail_messages', 'provider_draft_message_id'),
        client.schema.hasColumn('mail_messages', 'draft_conflict'),
        client.schema.hasColumn('mail_messages', 'remote_draft_fingerprint'),
        client.schema.hasColumn('mail_accounts', 'default_for_user_id'),
        client.schema.hasColumn('mail_messages', 'content_status'),
        client.schema.hasColumn('mail_messages', 'content_error'),
        client.schema.hasColumn('mail_messages', 'size'),
        client.schema.hasColumn('mail_sync_runs', 'history_complete'),
        client.schema.hasColumn('mail_sync_runs', 'recovering'),
        client.schema.hasColumn('mail_sync_runs', 'history_started_at'),
        client.schema.hasColumn('mail_sync_runs', 'pending_messages'),
      ]),
    ).resolves.toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);

    await expect(
      client.raw('PRAGMA table_info(mail_accounts)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'automatic_sync_interval_minutes',
          type: 'INTEGER',
          notnull: 1,
          dflt_value: "'5'",
        }),
      ]),
    );

    await expect(
      client.raw('PRAGMA index_list(mail_messages)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'mail_messages_account_provider_unique',
        }),
        expect.objectContaining({ name: 'mail_messages_account_sort_idx' }),
        expect.objectContaining({ name: 'mail_messages_content_status_idx' }),
        expect.objectContaining({
          name: 'mail_messages_account_todo_sort_idx',
        }),
        expect.objectContaining({
          name: 'mail_messages_account_conversation_idx',
        }),
        expect.objectContaining({
          name: 'mail_messages_account_read_sort_idx',
        }),
        expect.objectContaining({
          name: 'mail_messages_account_starred_sort_idx',
        }),
      ]),
    );
    await expect(
      client.raw('PRAGMA table_info(mail_messages)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'content_status',
          notnull: 1,
          dflt_value: "'complete'",
        }),
      ]),
    );
    await expect(
      client.raw('PRAGMA table_info(mail_sync_runs)'),
    ).resolves.toEqual(
      expect.arrayContaining(
        ['history_complete', 'recovering', 'pending_messages'].map((name) =>
          expect.objectContaining({
            name,
            notnull: 1,
            dflt_value: expect.stringMatching(/^'?0'?$/u),
          }),
        ),
      ),
    );
    await expect(
      client.raw('PRAGMA index_info(mail_messages_content_status_idx)'),
    ).resolves.toEqual([
      expect.objectContaining({ name: 'account_id' }),
      expect.objectContaining({ name: 'content_status' }),
    ]);
    await expect(
      client.raw('PRAGMA index_list(mail_accounts)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'mail_accounts_provider_address_unique',
        }),
        expect.objectContaining({
          name: 'mail_accounts_provider_subject_unique',
        }),
      ]),
    );
    await expect(
      client.raw('PRAGMA index_list(mail_accounts)'),
    ).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'mail_accounts_default_user_unique' }),
      ]),
    );
    await expect(
      client.raw('PRAGMA index_list(mail_credentials)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'mail_credentials_expiry_idx' }),
      ]),
    );
    await expect(
      client.raw('PRAGMA index_list(mail_signatures)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'mail_signatures_account_name_unique',
        }),
        expect.objectContaining({
          name: 'mail_signatures_default_account_unique',
        }),
        expect.objectContaining({
          name: 'mail_signatures_identity_name_unique',
        }),
        expect.objectContaining({
          name: 'mail_signatures_default_identity_unique',
        }),
      ]),
    );
    await expect(
      client.raw('PRAGMA index_list(mail_sync_runs)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'mail_sync_runs_account_status_idx' }),
        expect.objectContaining({
          name: 'mail_sync_runs_account_created_idx',
        }),
      ]),
    );
    await expect(
      client.raw('PRAGMA index_list(mail_submissions)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'mail_submissions_expired_idx' }),
        expect.objectContaining({
          name: 'mail_submissions_account_created_idx',
        }),
      ]),
    );
    await expect(client.raw('PRAGMA index_list(mail_labels)')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'mail_labels_owner_name_unique' }),
      ]),
    );
    await expect(
      client.raw('PRAGMA index_list(mail_message_labels)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'mail_message_labels_label_idx' }),
      ]),
    );

    await expect(
      metadataStore
        .get('mailAuthorizationStates')
        .then((stored) => stored?.document.fields.initialSyncReceivedAfter),
    ).resolves.toMatchObject({ type: 'datetimeTz' });
    await expect(
      metadataStore.get('mailAccounts').then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: {
        initialSyncReceivedAfter: { type: 'datetimeTz' },
        automaticSyncIntervalMinutes: { type: 'integer' },
      },
    });
    await expect(
      metadataStore
        .get('mailAccounts')
        .then((stored) => stored?.document.fields.defaultForUserId),
    ).resolves.toBeUndefined();
    await expect(
      metadataStore.get('mailMessages').then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: {
        contentStatus: { type: 'string' },
        contentError: { type: 'string' },
        size: { type: 'integer' },
        note: { type: 'text' },
        todo: { type: 'boolean' },
        providerDraftMessageId: { type: 'string' },
        remoteDraftFingerprint: { type: 'string' },
        draftConflict: { type: 'json' },
      },
    });
    await expect(
      metadataStore.get('mailSyncRuns').then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: {
        historyStartedAt: { type: 'datetimeTz' },
        historyComplete: { type: 'boolean' },
        recovering: { type: 'boolean' },
        pendingMessages: { type: 'integer' },
      },
    });
    await expect(
      metadataStore
        .get('mailSyncTombstones')
        .then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: {
        runId: { type: 'uuid' },
        providerMessageId: { type: 'string' },
      },
    });
    await expect(
      client.raw('PRAGMA table_info(mail_sync_tombstones)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'run_id', pk: 1 }),
        expect.objectContaining({ name: 'provider_message_id', pk: 2 }),
      ]),
    );
    await expect(
      client.raw('PRAGMA foreign_key_list(mail_sync_tombstones)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'mail_sync_runs',
          on_delete: 'CASCADE',
        }),
      ]),
    );
    await expect(
      metadataStore.get('mailSignatures').then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: {
        accountId: { type: 'uuid' },
        defaultForAccountId: { type: 'uuid' },
        defaultForIdentityId: { type: 'uuid' },
      },
    });
    await expect(
      metadataStore.get('mailLabels').then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: {
        ownerId: { type: 'string' },
        name: { type: 'string' },
        color: { type: 'string' },
      },
    });
    await expect(
      client.raw('PRAGMA foreign_key_list(mail_message_labels)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'mail_messages',
          on_delete: 'CASCADE',
        }),
        expect.objectContaining({
          table: 'mail_labels',
          on_delete: 'CASCADE',
        }),
      ]),
    );
    await expect(
      client.raw('PRAGMA foreign_key_list(mail_signatures)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'mail_accounts',
          on_delete: 'CASCADE',
        }),
        expect.objectContaining({
          table: 'mail_identities',
          on_delete: 'CASCADE',
        }),
      ]),
    );
  });

  it('drops all Mail schema and metadata', async () => {
    await migrateUp(database);
    await migrateDown(database);

    const client = await database.connection().client<SqliteClient>();
    await expect(
      Promise.all(
        COLLECTIONS.map(([, table]) => client.schema.hasTable(table)),
      ),
    ).resolves.toEqual(COLLECTIONS.map(() => false));
    for (const [collection] of COLLECTIONS) {
      await expect(metadataStore.get(collection)).resolves.toBeUndefined();
    }
  });
});

async function migrateUp(database: DatabaseManager) {
  return database
    .createMigrator({
      directory: MIGRATIONS_DIRECTORY,
      packageName: '@nocobase/app-plugin-mail',
    })
    .latest();
}

async function migrateDown(database: DatabaseManager) {
  return database
    .createMigrator({
      directory: MIGRATIONS_DIRECTORY,
      packageName: '@nocobase/app-plugin-mail',
    })
    .rollback();
}
