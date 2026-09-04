import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import { createQueueManager, type NocoBaseQueueManager } from '@nocobase/queue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import migration from '../database/migrations/202609030001_create_mail_tables.js';
import { SyncMailboxOperation } from '../server/operations/sync-mailbox.js';
import { createMailRuntime, type MailRuntime } from '../server/runtime.js';
import { DefaultMailService } from '../server/service.js';
import { createDatabaseMailStore } from '../server/store.js';
import type {
  MailAccount,
  MailProviderAdapter,
  MailProviderAdapterResolver,
  MailStore,
  NormalizedMailMessage,
} from '../server/types.js';

describe('mail MVP runtime', () => {
  let database: DatabaseManager;
  let store: MailStore;
  let queue: NocoBaseQueueManager | undefined;
  let runtime: MailRuntime | undefined;

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
    store = createDatabaseMailStore(database);
    await store.saveAccount(account());
    await store.replaceIdentities('account-1', [
      {
        id: 'identity-1',
        accountId: 'account-1',
        address: 'sender@example.com',
        isPrimary: true,
        canSend: true,
      },
    ]);
  });

  afterEach(async () => {
    await runtime?.close();
    await queue?.close();
    await database.destroy();
  });

  it('sends once for a repeated idempotency key', async () => {
    const sendMessage = vi.fn<MailProviderAdapter['sendMessage']>(async () => ({
      status: 'accepted',
      providerMessageId: 'provider-sent-1',
    }));
    const adapters = resolver({ ...baseAdapter(), sendMessage });
    const service = new DefaultMailService({
      store,
      adapters,
      outbox: { kick: vi.fn() },
    });
    const input = {
      accountId: 'account-1',
      identityId: 'identity-1',
      to: [{ address: 'recipient@example.com' }],
      subject: 'Hello',
      text: 'Mail body',
      idempotencyKey: 'request-1',
    } as const;

    const first = await service.sendMessage({ actorId: 'user-1' }, input);
    const second = await service.sendMessage({ actorId: 'user-1' }, input);
    const accounts = await service.listAccounts({ actorId: 'user-1' });

    expect(first).toMatchObject({
      status: 'accepted',
      providerMessageId: 'provider-sent-1',
    });
    expect(second).toEqual(first);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(accounts[0]).not.toHaveProperty('credentialReference');
  });

  it('rejects reuse of an idempotency key for different content', async () => {
    const sendMessage = vi.fn<MailProviderAdapter['sendMessage']>(async () => ({
      status: 'accepted',
      providerMessageId: 'provider-sent-1',
    }));
    const service = new DefaultMailService({
      store,
      adapters: resolver({ ...baseAdapter(), sendMessage }),
      outbox: { kick: vi.fn() },
    });
    const input = {
      accountId: 'account-1',
      identityId: 'identity-1',
      to: [{ address: 'recipient@example.com' }],
      subject: 'First content',
      text: 'Mail body',
      idempotencyKey: 'request-conflict',
    } as const;

    await service.sendMessage({ actorId: 'user-1' }, input);

    await expect(
      service.sendMessage(
        { actorId: 'user-1' },
        { ...input, subject: 'Different content' },
      ),
    ).rejects.toThrow('idempotency key');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does not allow an expired sender lease to overwrite recovery', async () => {
    const created = await store.createSubmission(
      { id: 'submission-1', accountId: 'account-1', status: 'pending' },
      'lease-test',
      'fingerprint',
    );
    await store.claimSubmission(
      created.id,
      'expired-sender',
      new Date(Date.now() - 1_000).toISOString(),
    );
    await store.recoverExpiredSubmissions(new Date().toISOString());

    const finished = await store.finishSubmission(
      { ...created, status: 'accepted', providerMessageId: 'too-late' },
      'expired-sender',
    );

    expect(finished).toMatchObject({ status: 'unknown' });
    expect(finished.providerMessageId).toBeUndefined();
  });

  it('rejects sending and synchronization for an inactive account', async () => {
    await store.saveAccount({ ...account(), status: 'revoked' });
    const service = new DefaultMailService({
      store,
      adapters: resolver(baseAdapter()),
      outbox: { kick: vi.fn() },
    });

    await expect(
      service.sendMessage(
        { actorId: 'user-1' },
        {
          accountId: 'account-1',
          identityId: 'identity-1',
          to: [{ address: 'recipient@example.com' }],
          subject: 'Hello',
          text: 'Mail body',
          idempotencyKey: 'inactive-account',
        },
      ),
    ).rejects.toThrow('not active');
    await expect(
      service.startSync({ actorId: 'user-1' }, { accountId: 'account-1' }),
    ).rejects.toThrow('not active');
  });

  it('imports history in pages and catches up from the starting watermark', async () => {
    const listMessages = vi
      .fn<NonNullable<MailProviderAdapter['listMessages']>>()
      .mockResolvedValueOnce({
        ok: true,
        value: {
          messages: [message('history-1', 'First')],
          nextCursor: 'page-2',
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { messages: [message('history-2', 'Second')] },
      });
    const listChanges = vi.fn<NonNullable<MailProviderAdapter['listChanges']>>(
      async (_input) => ({
        ok: true,
        value: {
          messages: [
            message('history-2', 'Second, updated'),
            message('new-1', 'New'),
          ],
          deletedProviderMessageIds: [],
          nextCursor: { value: 'watermark-2' },
          hasMore: false,
        },
      }),
    );
    const adapters = resolver({
      ...baseAdapter(),
      getCurrentSyncCursor: async () => ({
        ok: true,
        value: { value: 'watermark-1' },
      }),
      listMessages,
      listChanges,
    });
    queue = createQueueManager({
      default: 'sync',
      connections: { sync: { driver: 'sync' } },
      jobs: { autoLoad: false, locations: [] },
    });
    runtime = createMailRuntime({
      store,
      adapters,
      queue,
      queueName: 'mail:test',
    });
    const service = new DefaultMailService({
      store,
      adapters,
      outbox: { kick: vi.fn() },
    });
    const created = await service.startSync(
      { actorId: 'user-1' },
      { accountId: 'account-1', batchSize: 1 },
    );

    for (let step = 0; step < 4; step += 1) {
      await runtime.publishPending();
    }

    const completed = await store.getSyncRun(created.id);
    const messages = await service.listMessages(
      { actorId: 'user-1' },
      { accountIds: ['account-1'], limit: 20 },
    );
    expect(completed).toMatchObject({
      status: 'completed',
      phase: 'completed',
      processedMessages: 4,
      changeCursor: { value: 'watermark-2' },
    });
    expect(messages.items).toHaveLength(3);
    expect(messages.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerMessageId: 'history-2',
          subject: 'Second, updated',
        }),
      ]),
    );
    expect(listMessages).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: 'page-2', limit: 1 }),
    );
    expect(listChanges).toHaveBeenCalledWith({
      cursor: { value: 'watermark-1' },
      limit: 1,
    });
    expect(await store.getSyncCursor('account-1')).toEqual({
      value: 'watermark-2',
    });

    const next = await service.startSync(
      { actorId: 'user-1' },
      { accountId: 'account-1' },
    );
    expect(next.mode).toBe('incremental');
  });

  it('persists a retry Outbox without advancing the failed page checkpoint', async () => {
    const adapters = resolver({
      ...baseAdapter(),
      getCurrentSyncCursor: async () => ({
        ok: false,
        error: {
          code: 'PROVIDER_RATE_LIMITED',
          message: 'Try again later.',
          category: 'rate_limit',
          retryable: true,
          retryAfterMs: 1_000,
        },
      }),
      listMessages: async () => ({ ok: true, value: { messages: [] } }),
    });
    const service = new DefaultMailService({
      store,
      adapters,
      outbox: { kick: vi.fn() },
    });
    const created = await service.startSync(
      { actorId: 'user-1' },
      { accountId: 'account-1' },
    );
    const original = await store.claimOutbox(
      new Date().toISOString(),
      'original-lease',
      new Date(Date.now() + 10_000).toISOString(),
      10,
    );
    await Promise.all(
      original.map((record) =>
        store.markOutboxPublished(
          record.id,
          record.leaseToken ?? '',
          new Date().toISOString(),
        ),
      ),
    );
    const operation = new SyncMailboxOperation({ store, adapters });

    await operation.execute(original[0].payload);

    const run = await store.getSyncRun(created.id);
    expect(run).toMatchObject({
      status: 'pending',
      phase: 'preparing',
      processedPages: 0,
      error: { code: 'PROVIDER_RATE_LIMITED' },
    });
    const claimed = await store.claimOutbox(
      new Date(Date.now() + 2_000).toISOString(),
      'test-lease',
      new Date(Date.now() + 10_000).toISOString(),
      10,
    );
    expect(claimed).toHaveLength(1);
    expect(claimed[0].deduplicationKey).toContain(':retry:');
  });

  it('ignores a redelivered task after its sync step advanced', async () => {
    const listMessages = vi.fn<
      NonNullable<MailProviderAdapter['listMessages']>
    >(async () => ({ ok: true, value: { messages: [] } }));
    const adapters = resolver({
      ...baseAdapter(),
      getCurrentSyncCursor: async () => ({
        ok: true,
        value: { value: 'watermark-1' },
      }),
      listMessages,
      listChanges: async () => ({
        ok: true,
        value: {
          messages: [],
          deletedProviderMessageIds: [],
          nextCursor: { value: 'watermark-1' },
          hasMore: false,
        },
      }),
    });
    const service = new DefaultMailService({
      store,
      adapters,
      outbox: { kick: vi.fn() },
    });
    const created = await service.startSync(
      { actorId: 'user-1' },
      { accountId: 'account-1' },
    );
    const first = await store.claimOutbox(
      new Date().toISOString(),
      'first-outbox-lease',
      new Date(Date.now() + 10_000).toISOString(),
      1,
    );
    await store.markOutboxPublished(
      first[0].id,
      first[0].leaseToken ?? '',
      new Date().toISOString(),
    );
    const operation = new SyncMailboxOperation({ store, adapters });

    await operation.execute(first[0].payload);
    await operation.execute(first[0].payload);

    expect(listMessages).not.toHaveBeenCalled();
    expect(await store.getSyncRun(created.id)).toMatchObject({
      phase: 'history',
      revision: 1,
      processedPages: 1,
    });
  });

  it('fences Outbox completion by lease token', async () => {
    const service = new DefaultMailService({
      store,
      adapters: resolver(baseAdapter()),
      outbox: { kick: vi.fn() },
    });
    await service.startSync({ actorId: 'user-1' }, { accountId: 'account-1' });
    const first = await store.claimOutbox(
      new Date().toISOString(),
      'old-lease',
      new Date(Date.now() - 1_000).toISOString(),
      1,
    );
    const second = await store.claimOutbox(
      new Date().toISOString(),
      'new-lease',
      new Date(Date.now() + 10_000).toISOString(),
      1,
    );

    expect(
      await store.markOutboxPublished(
        first[0].id,
        'old-lease',
        new Date().toISOString(),
      ),
    ).toBe(false);
    expect(
      await store.markOutboxPublished(
        second[0].id,
        'new-lease',
        new Date().toISOString(),
      ),
    ).toBe(true);
  });
});

function account(): MailAccount {
  return {
    id: 'account-1',
    userId: 'user-1',
    provider: { type: 'test', name: 'test' },
    address: 'sender@example.com',
    credentialReference: 'secret:test',
    scopes: [],
    status: 'active',
    isDefault: true,
  };
}

function resolver(adapter: MailProviderAdapter): MailProviderAdapterResolver {
  return { resolve: async () => adapter };
}

function baseAdapter(): MailProviderAdapter {
  return {
    identity: { type: 'test', name: 'test' },
    capabilities: {
      receive: true,
      send: true,
      incrementalSync: true,
      pushNotifications: false,
      folders: false,
      labels: false,
      drafts: false,
      moveMessage: false,
      aliases: false,
    },
  };
}

function message(
  providerMessageId: string,
  subject: string,
): NormalizedMailMessage {
  return {
    providerMessageId,
    providerFolderIds: ['inbox'],
    to: [{ address: 'sender@example.com' }],
    cc: [],
    bcc: [],
    replyTo: [],
    references: [],
    subject,
    receivedAt: '2026-09-03T00:00:00.000Z',
    read: false,
    starred: false,
    draft: false,
    attachments: [],
  };
}
