import { resolve } from 'node:path';

import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import signatureScopeMigration from '../database/migrations/202609140004_move_mail_signatures_to_account_scope.js';

interface SqliteClient {
  readonly schema: {
    hasTable(name: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
  raw(sql: string): Promise<readonly { readonly name: string }[]>;
}

interface LegacyMailAccountRow extends Row {
  id: string;
  userId: string;
  providerType: string;
  providerName: string;
  address: string;
  credentialReference: string;
  scopes: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface LegacyMailIdentityRow extends Row {
  id: string;
  accountId: string;
  address: string;
  primaryForAccountId?: string | null;
  canSend: boolean;
}

interface MigratedMailSignatureRow extends Row {
  id: string;
  identityId: string;
  accountId?: string | null;
  name: string;
  text: string;
  defaultForIdentityId?: string | null;
  defaultForAccountId?: string | null;
  createdAt: string;
  updatedAt: string;
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
      fields: {
        defaultForUserId: { type: 'string' },
        initialSyncReceivedAfter: { type: 'datetime' },
      },
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
      fields: {
        accountId: { type: 'uuid' },
        defaultForAccountId: { type: 'uuid' },
        defaultForIdentityId: { type: 'uuid' },
      },
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
          table: 'mail_accounts',
          on_delete: 'CASCADE',
        }),
        expect.objectContaining({
          table: 'mail_identities',
          on_delete: 'CASCADE',
        }),
      ]),
    );
    await expect(client.raw('PRAGMA index_list(mail_labels)')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'mail_labels_owner_name_unique',
        }),
      ]),
    );
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
      metadataStore.get('mailLabels').then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: {
        ownerId: { type: 'string' },
        name: { type: 'string' },
        color: { type: 'string' },
      },
    });
  });

  it('applies label color as a follow-up migration', async () => {
    const migrator = database.createMigrator({
      directory: MIGRATIONS_DIRECTORY,
      packageName: '@nocobase/app-plugin-mail',
    });

    await expect(
      migrator.upTo('202609140001_add_local_mail_labels'),
    ).resolves.toMatchObject({
      executed: [
        '202609030001_create_mail_tables',
        '202609140001_add_local_mail_labels',
      ],
    });
    await expect(
      migrator.upTo('202609140002_add_mail_label_color'),
    ).resolves.toMatchObject({
      executed: ['202609140002_add_mail_label_color'],
      skipped: [
        '202609030001_create_mail_tables',
        '202609140001_add_local_mail_labels',
      ],
    });

    const client = await database.connection().client<SqliteClient>();
    await expect(client.schema.hasColumn('mail_labels', 'color')).resolves.toBe(
      true,
    );
  });

  it('persists the initial sync date on accounts and OAuth state', async () => {
    const migrator = database.createMigrator({
      directory: MIGRATIONS_DIRECTORY,
      packageName: '@nocobase/app-plugin-mail',
    });

    await expect(
      migrator.upTo('202609140003_add_account_initial_sync_date'),
    ).resolves.toMatchObject({
      executed: [
        '202609030001_create_mail_tables',
        '202609140001_add_local_mail_labels',
        '202609140002_add_mail_label_color',
        '202609140003_add_account_initial_sync_date',
      ],
    });

    const client = await database.connection().client<SqliteClient>();
    await expect(
      client.schema.hasColumn('mail_accounts', 'initial_sync_received_after'),
    ).resolves.toBe(true);
    await expect(
      client.schema.hasColumn(
        'mail_authorization_states',
        'initial_sync_received_after',
      ),
    ).resolves.toBe(true);
  });

  it('moves existing signatures to account scope and rolls the fields back', async () => {
    const connection = database.connection();
    const migrator = database.createMigrator({
      directory: MIGRATIONS_DIRECTORY,
      packageName: '@nocobase/app-plugin-mail',
    });
    await migrator.upTo('202609140003_add_account_initial_sync_date');

    await connection.query
      .insertInto<LegacyMailAccountRow>('mailAccounts')
      .values([
        {
          id: 'account-1',
          userId: 'user-1',
          providerType: 'gmail',
          providerName: 'google',
          address: 'primary@example.com',
          credentialReference: 'credential-1',
          scopes: JSON.stringify([]),
          status: 'active',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
        {
          id: 'account-2',
          userId: 'user-1',
          providerType: 'gmail',
          providerName: 'google',
          address: 'other@example.com',
          credentialReference: 'credential-2',
          scopes: JSON.stringify([]),
          status: 'active',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ])
      .execute();
    await connection.query
      .insertInto<LegacyMailIdentityRow>('mailIdentities')
      .values([
        {
          id: 'identity-1',
          accountId: 'account-1',
          address: 'primary@example.com',
          primaryForAccountId: 'account-1',
          canSend: true,
        },
        {
          id: 'identity-2',
          accountId: 'account-1',
          address: 'alias@example.com',
          primaryForAccountId: null,
          canSend: true,
        },
        {
          id: 'identity-3',
          accountId: 'account-2',
          address: 'other@example.com',
          primaryForAccountId: 'account-2',
          canSend: true,
        },
      ])
      .execute();
    await connection.query
      .insertInto<MigratedMailSignatureRow>('mailSignatures')
      .values([
        {
          id: 'signature-primary',
          identityId: 'identity-1',
          name: 'Work',
          text: 'Primary',
          defaultForIdentityId: 'identity-1',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
        {
          id: 'signature-alias',
          identityId: 'identity-2',
          name: 'Work',
          text: 'Alias',
          defaultForIdentityId: 'identity-2',
          createdAt: '2026-09-02T00:00:00.000Z',
          updatedAt: '2026-09-02T00:00:00.000Z',
        },
        {
          id: 'signature-support',
          identityId: 'identity-2',
          name: 'Support',
          text: 'Support',
          defaultForIdentityId: null,
          createdAt: '2026-09-03T00:00:00.000Z',
          updatedAt: '2026-09-03T00:00:00.000Z',
        },
        {
          id: 'signature-other',
          identityId: 'identity-3',
          name: 'Work',
          text: 'Other',
          defaultForIdentityId: 'identity-3',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ])
      .execute();

    await signatureScopeMigration.up({
      builder: connection.builder,
      query: connection.query,
      connection,
    });

    await expect(
      connection.query
        .selectFrom<MigratedMailSignatureRow>('mailSignatures')
        .select(['id', 'accountId', 'identityId', 'defaultForAccountId'])
        .orderBy('id', 'asc')
        .execute(),
    ).resolves.toEqual([
      {
        id: 'signature-other',
        accountId: 'account-2',
        identityId: 'identity-3',
        defaultForAccountId: 'account-2',
      },
      {
        id: 'signature-primary',
        accountId: 'account-1',
        identityId: 'identity-1',
        defaultForAccountId: 'account-1',
      },
      {
        id: 'signature-support',
        accountId: 'account-1',
        identityId: 'identity-2',
        defaultForAccountId: null,
      },
    ]);
    const client = await connection.client<SqliteClient>();
    await expect(
      client.schema.hasColumn('mail_signatures', 'account_id'),
    ).resolves.toBe(true);
    await expect(
      client.schema.hasColumn('mail_signatures', 'default_for_account_id'),
    ).resolves.toBe(true);

    await signatureScopeMigration.down({
      builder: connection.builder,
      query: connection.query,
      connection,
    });

    await expect(
      client.schema.hasColumn('mail_signatures', 'account_id'),
    ).resolves.toBe(false);
    await expect(
      client.schema.hasColumn('mail_signatures', 'default_for_account_id'),
    ).resolves.toBe(false);
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
  await database
    .createMigrator({
      directory: MIGRATIONS_DIRECTORY,
      packageName: '@nocobase/app-plugin-mail',
    })
    .latest();
}

async function migrateDown(database: DatabaseManager): Promise<void> {
  await database
    .createMigrator({
      directory: MIGRATIONS_DIRECTORY,
      packageName: '@nocobase/app-plugin-mail',
    })
    .rollback();
}
