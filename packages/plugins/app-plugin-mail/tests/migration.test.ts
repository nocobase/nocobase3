import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../database/migrations/202609030001_create_mail_tables.js';

interface SqliteClient {
  readonly schema: {
    hasTable(name: string): Promise<boolean>;
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
  ['mailSubmissions', 'mail_submissions'],
  ['mailOutbox', 'mail_outbox'],
  ['mailSignatures', 'mail_signatures'],
] as const;

describe('mail database migration', () => {
  let database: DatabaseManager;
  let metadataStore: InMemoryCollectionMetadataStore;

  beforeEach(() => {
    metadataStore = new InMemoryCollectionMetadataStore();
    database = createDatabaseManager({
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

  it('creates tables, idempotency constraints, and metadata', async () => {
    await migrateUp(database);
    const client = await database.connection().client<SqliteClient>();
    await expect(
      Promise.all(
        COLLECTIONS.map(([, table]) => client.schema.hasTable(table)),
      ),
    ).resolves.toEqual(COLLECTIONS.map(() => true));
    await expect(
      client.raw('PRAGMA index_list(mail_messages)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'mail_messages_account_provider_unique',
        }),
        expect.objectContaining({ name: 'mail_messages_account_sort_idx' }),
        expect.objectContaining({
          name: 'mail_messages_account_todo_sort_idx',
        }),
      ]),
    );
    await expect(
      client.raw('PRAGMA index_list(mail_credentials)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'mail_credentials_expiry_idx',
        }),
      ]),
    );
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
        expect.objectContaining({ name: 'mail_accounts_default_user_unique' }),
      ]),
    );
    await expect(
      metadataStore.get('mailMessages').then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: {
        note: { type: 'text' },
        todo: { type: 'boolean' },
      },
    });
    await expect(
      metadataStore
        .get('mailMessages')
        .then((stored) => stored?.document.fields.providerFolderIds),
    ).resolves.toBeUndefined();
    await expect(
      metadataStore
        .get('mailTemplates')
        .then((stored) => stored?.document.fields.scope),
    ).resolves.toBeUndefined();
    await expect(
      metadataStore.get('mailCredentials').then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: {
        value: { type: 'text' },
        purpose: { type: 'string' },
        expiresAt: { type: 'datetime' },
      },
    });
    await expect(
      metadataStore.get('mailAccounts').then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: { defaultForUserId: { type: 'string' } },
    });
    await expect(
      metadataStore
        .get('mailAccounts')
        .then((stored) => stored?.document.fields.credentialExpiresAt),
    ).resolves.toBeUndefined();
    await expect(
      metadataStore.get('mailIdentities').then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: { primaryForAccountId: { type: 'uuid' } },
    });
    await expect(
      metadataStore
        .get('mailIdentities')
        .then((stored) => stored?.document.fields.signatureText),
    ).resolves.toBeUndefined();
    await expect(
      metadataStore.get('mailSignatures').then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: { defaultForIdentityId: { type: 'uuid' } },
    });
    await expect(
      metadataStore
        .get('mailPushPending')
        .then((stored) => stored?.document.fields.requestedBy),
    ).resolves.toBeUndefined();
    await expect(
      client.raw('PRAGMA index_list(mail_signatures)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'mail_signatures_identity_name_unique',
        }),
        expect.objectContaining({
          name: 'mail_signatures_default_identity_unique',
        }),
      ]),
    );
    await expect(client.raw('PRAGMA index_list(mail_outbox)')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'mail_outbox_deduplication_unique' }),
        expect.objectContaining({ name: 'mail_outbox_ready_idx' }),
        expect.objectContaining({ name: 'mail_outbox_retention_idx' }),
      ]),
    );
    await expect(
      client.raw('PRAGMA index_list(mail_push_subscriptions)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'mail_push_subscriptions_provider_unique',
        }),
        expect.objectContaining({
          name: 'mail_push_subscriptions_renew_idx',
        }),
      ]),
    );
    await expect(
      metadataStore.get('mailSubmissions').then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: {
        scheduledAt: { type: 'datetime' },
        requestedBy: { type: 'string' },
        composeInput: { type: 'json' },
      },
    });
    await expect(
      client.raw('PRAGMA index_list(mail_message_folders)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          origin: 'pk',
          unique: 1,
        }),
        expect.objectContaining({
          name: 'mail_message_folders_account_folder_idx',
        }),
      ]),
    );
    await expect(
      metadataStore.get('mailSyncRuns').then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: {
        historyCursor: { type: 'text' },
        folderCursor: { type: 'text' },
        baselineCursor: { type: 'json' },
      },
    });
    await expect(
      client.raw('PRAGMA foreign_key_list(mail_message_folders)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'mail_messages',
          on_delete: 'CASCADE',
        }),
        expect.objectContaining({
          table: 'mail_accounts',
          on_delete: 'CASCADE',
        }),
      ]),
    );
    await expect(
      client.raw('PRAGMA foreign_key_list(mail_signatures)'),
    ).resolves.toEqual(
      expect.arrayContaining([
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

async function migrateUp(database: DatabaseManager): Promise<void> {
  const connection = database.connection();
  await migration.up({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
}

async function migrateDown(database: DatabaseManager): Promise<void> {
  const connection = database.connection();
  await migration.down?.({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
}
