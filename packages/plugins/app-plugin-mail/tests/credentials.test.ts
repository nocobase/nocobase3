import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../database/migrations/202609030001_create_mail_tables.js';
import { createDatabaseMailCredentialVault } from '../server/credentials.js';
import { createDatabaseMailStore } from '../server/store.js';

describe('Mail OAuth persistence', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({
      default: 'main',
      metadataStore: new InMemoryCollectionMetadataStore(),
      connections: {
        main: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
    const connection = database.connection();
    await migration.up({
      builder: connection.builder,
      query: connection.query,
      connection,
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('encrypts credentials at rest and supports token rotation', async () => {
    const vault = createDatabaseMailCredentialVault(
      database,
      'test-encryption-key-with-at-least-32-characters',
    );
    const reference = await vault.put({
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
    });
    const row = await database
      .query()
      .selectFrom<Row>('mailCredentials')
      .selectAll()
      .where('reference', '=', reference)
      .executeTakeFirstOrThrow();

    expect(String(row.ciphertext)).not.toContain('access-secret');
    await expect(vault.get(reference)).resolves.toEqual({
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
    });

    await vault.replace(reference, { accessToken: 'rotated-secret' });
    await expect(vault.get(reference)).resolves.toEqual({
      accessToken: 'rotated-secret',
    });
  });

  it('consumes an OAuth state transaction exactly once', async () => {
    const store = createDatabaseMailStore(database);
    const transaction = {
      stateHash: 'a'.repeat(64),
      userId: 'user-1',
      provider: { type: 'gmail', name: 'google' },
      redirectUri: 'https://example.com/main/mail/oauth/callback',
      verifierCredentialReference: 'mail-credential:verifier',
      scopes: ['gmail.modify'],
      expiresAt: '2099-01-01T00:00:00.000Z',
    } as const;

    await store.createAuthorizationTransaction(transaction);

    await expect(
      store.consumeAuthorizationTransaction(
        transaction.stateHash,
        '2026-09-04T00:00:00.000Z',
      ),
    ).resolves.toMatchObject(transaction);
    await expect(
      store.consumeAuthorizationTransaction(
        transaction.stateHash,
        '2026-09-04T00:00:01.000Z',
      ),
    ).resolves.toBeUndefined();
  });

  it('stores an authorized account and its identity atomically', async () => {
    const store = createDatabaseMailStore(database);
    const account = {
      id: 'account-1',
      userId: 'user-1',
      provider: { type: 'gmail', name: 'google' },
      address: 'user@example.com',
      credentialReference: 'mail-credential:account-1',
      scopes: ['gmail.modify'],
      status: 'active' as const,
      isDefault: true,
    };
    const identity = {
      id: 'duplicate-identity',
      accountId: account.id,
      address: account.address,
      isPrimary: true,
      canSend: true,
    };

    await expect(
      store.saveAuthorizedAccount(account, [identity, identity]),
    ).rejects.toThrow();
    await expect(store.getAccount(account.id)).resolves.toBeUndefined();
  });
});
