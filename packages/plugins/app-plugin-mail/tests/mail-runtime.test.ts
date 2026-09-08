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
  MailCredentialVault,
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
    vi.useRealTimers();
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
    await expect(
      service.listSubmissions({ actorId: 'user-1' }),
    ).resolves.toMatchObject([
      {
        id: first.id,
        accountId: 'account-1',
        status: 'accepted',
        providerMessageId: 'provider-sent-1',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    ]);
  });

  it('reuses persisted schedule times when a bulk request is retried', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T00:00:00.000Z'));
    const service = new DefaultMailService({
      store,
      adapters: resolver(baseAdapter()),
      outbox: { kick: vi.fn() },
    });
    const input = {
      accountId: 'account-1',
      identityId: 'identity-1',
      recipients: [
        { address: 'first@example.com' },
        { address: 'second@example.com' },
      ],
      subject: 'Private update',
      text: 'Mail body',
      idempotencyKey: 'bulk-request-1',
    } as const;

    const first = await service.sendBulk({ actorId: 'user-1' }, input);
    vi.setSystemTime(new Date('2026-09-08T00:01:00.000Z'));
    const second = await service.sendBulk({ actorId: 'user-1' }, input);

    expect(second).toEqual(first);
    expect(first).toHaveLength(2);
    expect(first.every((submission) => submission.status === 'pending')).toBe(
      true,
    );
  });

  it('persists a scheduled message and sends it only after its due time', async () => {
    const sendMessage = vi.fn<MailProviderAdapter['sendMessage']>(async () => ({
      status: 'accepted',
      providerMessageId: 'provider-scheduled-1',
    }));
    const adapters = resolver({ ...baseAdapter(), sendMessage });
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
      outbox: runtime,
    });
    const scheduledAt = new Date(Date.now() + 60_000).toISOString();

    const submission = await service.sendMessage(
      { actorId: 'user-1' },
      {
        accountId: 'account-1',
        identityId: 'identity-1',
        to: [{ address: 'recipient@example.com' }],
        subject: 'Later',
        text: 'Scheduled body',
        scheduledAt,
        idempotencyKey: 'scheduled-request-1',
      },
    );

    expect(submission).toMatchObject({ status: 'pending', scheduledAt });
    await runtime.publishPending();
    expect(sendMessage).not.toHaveBeenCalled();
    const due = await store.claimOutbox(
      new Date(Date.now() + 61_000).toISOString(),
      'due-lease',
      new Date(Date.now() + 90_000).toISOString(),
      1,
    );
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      type: 'sendScheduledMail',
      aggregateId: submission.id,
    });
    await store.releaseOutbox(
      due[0].id,
      due[0].leaseToken ?? '',
      new Date().toISOString(),
    );
    await runtime.publishPending();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    await expect(
      service.listSubmissions({ actorId: 'user-1' }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: submission.id,
          status: 'accepted',
          providerMessageId: 'provider-scheduled-1',
        }),
      ]),
    );
  });

  it('schedules automatic mailbox sync without duplicating an active run', async () => {
    queue = createQueueManager({
      default: 'sync',
      connections: { sync: { driver: 'sync' } },
      jobs: { autoLoad: false, locations: [] },
    });
    runtime = createMailRuntime({
      store,
      adapters: resolver(baseAdapter()),
      queue,
      queueName: 'mail:automatic-sync-test',
    });

    await expect(runtime.createAutomaticSyncRuns()).resolves.toBe(1);
    await expect(runtime.createAutomaticSyncRuns()).resolves.toBe(0);

    await expect(store.findActiveSyncRun('account-1')).resolves.toMatchObject({
      accountId: 'account-1',
      requestedBy: 'user-1',
      mode: 'initial',
    });
  });

  it('creates and renews push subscriptions during the automatic sweep', async () => {
    const upsertPushSubscription = vi
      .fn<NonNullable<MailProviderAdapter['upsertPushSubscription']>>()
      .mockResolvedValueOnce({
        ok: true,
        value: {
          providerSubscriptionId: 'provider-subscription-1',
          renewAfter: '2099-01-01T00:00:00.000Z',
          expiresAt: '2099-01-02T00:00:00.000Z',
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          providerSubscriptionId: 'provider-subscription-1',
          renewAfter: '2099-01-03T00:00:00.000Z',
          expiresAt: '2099-01-04T00:00:00.000Z',
        },
      });
    const close = vi.fn(async () => undefined);
    const deletePushSubscription = vi.fn<
      NonNullable<MailProviderAdapter['deletePushSubscription']>
    >(async () => ({ ok: true, value: undefined }));
    queue = createQueueManager({
      default: 'sync',
      connections: { sync: { driver: 'sync' } },
      jobs: { autoLoad: false, locations: [] },
    });
    runtime = createMailRuntime({
      store,
      adapters: resolver({
        ...baseAdapter(),
        capabilities: {
          ...baseAdapter().capabilities,
          pushNotifications: true,
        },
        upsertPushSubscription,
        deletePushSubscription,
        close,
      }),
      queue,
      queueName: 'mail:push-subscription-test',
      pushWebhookUrl: 'https://mail.example.com/main/mail/webhooks',
      pushWebhookSecret: 'a'.repeat(32),
    });

    await runtime.createAutomaticSyncRuns();
    expect(upsertPushSubscription).toHaveBeenCalledWith({
      notificationUrl: `https://mail.example.com/main/mail/webhooks/test/test/${'a'.repeat(32)}`,
      clientState: 'a'.repeat(32),
      providerSubscriptionId: undefined,
    });
    await expect(store.getPushSubscription('account-1')).resolves.toMatchObject(
      {
        providerSubscriptionId: 'provider-subscription-1',
        renewAfter: '2099-01-01T00:00:00.000Z',
      },
    );

    await store.savePushSubscription({
      accountId: 'account-1',
      provider: account().provider,
      providerSubscriptionId: 'provider-subscription-1',
      configurationFingerprint: 'stale-fingerprint',
      renewAfter: '2000-01-01T00:00:00.000Z',
      expiresAt: '2000-01-02T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
    });
    await runtime.createAutomaticSyncRuns();

    expect(upsertPushSubscription).toHaveBeenLastCalledWith(
      expect.objectContaining({
        providerSubscriptionId: undefined,
      }),
    );
    expect(upsertPushSubscription).toHaveBeenCalledTimes(2);
    expect(deletePushSubscription).toHaveBeenCalledExactlyOnceWith(
      'provider-subscription-1',
    );
    expect(deletePushSubscription.mock.invocationCallOrder[0]).toBeLessThan(
      upsertPushSubscription.mock.invocationCallOrder[1],
    );
    expect(close.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('stops a recreated same-ID watch when the account is removed during rotation', async () => {
    await store.savePushSubscription({
      accountId: 'account-1',
      provider: account().provider,
      providerSubscriptionId: 'user@example.com',
      configurationFingerprint: 'stale-fingerprint',
      renewAfter: '2000-01-01T00:00:00.000Z',
      expiresAt: '2000-01-02T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
    });
    const deletePushSubscription = vi.fn<
      NonNullable<MailProviderAdapter['deletePushSubscription']>
    >(async () => ({ ok: true, value: undefined }));
    const upsertPushSubscription = vi.fn<
      NonNullable<MailProviderAdapter['upsertPushSubscription']>
    >(async () => {
      await store.markAccountRemoving('account-1', 'user-1');
      await store.deleteAccount('account-1');
      return {
        ok: true,
        value: {
          providerSubscriptionId: 'user@example.com',
          renewAfter: '2099-01-01T00:00:00.000Z',
          expiresAt: '2099-01-02T00:00:00.000Z',
        },
      };
    });
    queue = createQueueManager({
      default: 'sync',
      connections: { sync: { driver: 'sync' } },
      jobs: { autoLoad: false, locations: [] },
    });
    runtime = createMailRuntime({
      store,
      adapters: resolver({
        ...baseAdapter(),
        capabilities: {
          ...baseAdapter().capabilities,
          pushNotifications: true,
        },
        upsertPushSubscription,
        deletePushSubscription,
      }),
      queue,
      queueName: 'mail:push-same-id-race-test',
      pushWebhookUrl: 'https://mail.example.com/main/mail/webhooks',
      pushWebhookSecret: 'a'.repeat(32),
    });

    await runtime.createAutomaticSyncRuns();

    expect(deletePushSubscription).toHaveBeenCalledTimes(2);
    expect(deletePushSubscription).toHaveBeenNthCalledWith(
      1,
      'user@example.com',
    );
    expect(deletePushSubscription).toHaveBeenNthCalledWith(
      2,
      'user@example.com',
    );
    await expect(
      store.getPushSubscription('account-1'),
    ).resolves.toBeUndefined();
  });

  it('preserves a complete subscription for remote cleanup while removal starts', async () => {
    await store.savePushSubscription({
      accountId: 'account-1',
      provider: account().provider,
      providerSubscriptionId: 'subscription-before-removal',
      configurationFingerprint: 'removal-fingerprint',
      renewAfter: '2000-01-01T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
    });
    await store.markAccountRemoving('account-1', 'user-1');

    await expect(
      store.claimPushSubscriptionMaintenance(
        account(),
        'removal-race-lease',
        new Date().toISOString(),
        new Date(Date.now() + 60_000).toISOString(),
      ),
    ).resolves.toBeUndefined();
    await expect(store.getPushSubscription('account-1')).resolves.toMatchObject(
      {
        providerSubscriptionId: 'subscription-before-removal',
      },
    );
  });

  it('deduplicates push-triggered synchronization', async () => {
    queue = createQueueManager({
      default: 'sync',
      connections: { sync: { driver: 'sync' } },
      jobs: { autoLoad: false, locations: [] },
    });
    runtime = createMailRuntime({
      store,
      adapters: resolver(baseAdapter()),
      queue,
      queueName: 'mail:push-sync-test',
    });

    const active = await store.createSyncRun({
      id: 'active-push-sync',
      accountId: 'account-1',
      requestedBy: 'user-1',
      mode: 'incremental',
      policy: { maxMessages: 10_000, batchSize: 200 },
    });
    await expect(runtime.schedulePushSync('account-1')).resolves.toBe(false);
    await store.clearPushSyncPending('account-1', 'stale-request-token');

    const claimed = await store.claimSyncRun(
      active.id,
      active.revision,
      active.phase,
      'push-race-lease',
      new Date(Date.now() + 30_000).toISOString(),
    );
    if (!claimed) throw new Error('Expected to claim push synchronization.');
    const committed = await store.commitSyncStep({
      run: claimed,
      messages: [],
      phase: 'completed',
      status: 'completed',
      changeCursor: { value: 'after-first-push' },
      createNextTask: false,
    });

    expect(committed).toMatchObject({
      status: 'running',
      phase: 'incremental',
      revision: 1,
    });
    const next = await store.claimOutbox(
      new Date().toISOString(),
      'push-follow-up-outbox',
      new Date(Date.now() + 30_000).toISOString(),
      10,
    );
    expect(next).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aggregateId: active.id,
          payload: expect.objectContaining({
            expectedRevision: 1,
            expectedPhase: 'incremental',
          }),
        }),
      ]),
    );
  });

  it('resolves a reply against the owned stored message', async () => {
    await store.commitSyncBatch({
      accountId: 'account-1',
      folders: [],
      messages: [
        {
          ...message('provider-parent', 'Original'),
          internetMessageId: '<parent@example.com>',
          providerConversationId: 'thread-1',
          references: ['<root@example.com>'],
        },
      ],
      deletedProviderMessageIds: [],
      nextCursor: { value: 'reply-test' },
    });
    const stored = await store.listMessages('user-1', {});
    const sendMessage = vi.fn<MailProviderAdapter['sendMessage']>(async () => ({
      status: 'accepted',
      providerMessageId: 'provider-reply',
    }));
    const service = new DefaultMailService({
      store,
      adapters: resolver({ ...baseAdapter(), sendMessage }),
      outbox: { kick: vi.fn() },
    });

    await service.sendMessage(
      { actorId: 'user-1' },
      {
        accountId: 'account-1',
        identityId: 'identity-1',
        to: [{ address: 'recipient@example.com' }],
        subject: 'Re: Original',
        text: 'Reply body',
        inReplyToMessageId: stored.items[0].id,
        idempotencyKey: 'reply-request-1',
      },
    );

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          inReplyTo: '<parent@example.com>',
          references: ['<root@example.com>', '<parent@example.com>'],
          providerConversationId: 'thread-1',
          replyToProviderMessageId: 'provider-parent',
        }),
      }),
    );
  });

  it('updates Provider and local message state, then deletes the message', async () => {
    await store.commitSyncBatch({
      accountId: 'account-1',
      folders: [],
      messages: [message('provider-mutable', 'Mutable')],
      deletedProviderMessageIds: [],
      nextCursor: { value: 'mutation-test' },
    });
    const stored = await store.listMessages('user-1', {});
    const setRead = vi.fn<NonNullable<MailProviderAdapter['setRead']>>(
      async () => ({ ok: true, value: undefined }),
    );
    const setStarred = vi.fn<NonNullable<MailProviderAdapter['setStarred']>>(
      async () => ({ ok: true, value: undefined }),
    );
    const deleteMessage = vi.fn<
      NonNullable<MailProviderAdapter['deleteMessage']>
    >(async () => ({ ok: true, value: undefined }));
    const service = new DefaultMailService({
      store,
      adapters: resolver({
        ...baseAdapter(),
        setRead,
        setStarred,
        deleteMessage,
      }),
      outbox: { kick: vi.fn() },
    });

    const updated = await service.updateMessage(
      { actorId: 'user-1' },
      {
        accountId: 'account-1',
        messageId: stored.items[0].id,
        read: true,
        starred: true,
      },
    );
    expect(updated).toMatchObject({ read: true, starred: true });
    expect(setRead).toHaveBeenCalledWith('provider-mutable', true, undefined);
    expect(setStarred).toHaveBeenCalledWith(
      'provider-mutable',
      true,
      undefined,
    );

    await service.deleteMessage(
      { actorId: 'user-1' },
      {
        accountId: 'account-1',
        messageId: stored.items[0].id,
        permanently: true,
      },
    );
    expect(deleteMessage).toHaveBeenCalledWith(
      'provider-mutable',
      true,
      undefined,
    );
    await expect(store.listMessages('user-1', {})).resolves.toMatchObject({
      items: [],
    });
  });

  it('stores private notes and todo state without losing them on Provider sync', async () => {
    await store.commitSyncBatch({
      accountId: 'account-1',
      folders: [],
      messages: [message('provider-note', 'Remember this')],
      deletedProviderMessageIds: [],
      nextCursor: { value: 'note-test-1' },
    });
    const stored = (await store.listMessages('user-1', {})).items[0];
    const service = new DefaultMailService({
      store,
      adapters: resolver(baseAdapter()),
      outbox: { kick: vi.fn() },
    });

    await expect(
      service.updateMessage(
        { actorId: 'user-1' },
        {
          accountId: 'account-1',
          messageId: stored.id,
          note: 'Follow up on Friday',
          todo: true,
        },
      ),
    ).resolves.toMatchObject({ note: 'Follow up on Friday', todo: true });
    await store.commitSyncBatch({
      accountId: 'account-1',
      folders: [],
      messages: [
        { ...message('provider-note', 'Updated subject'), read: true },
      ],
      deletedProviderMessageIds: [],
      nextCursor: { value: 'note-test-2' },
    });

    await expect(store.listMessages('user-1', {})).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          note: 'Follow up on Friday',
          todo: true,
          subject: 'Updated subject',
        }),
      ],
    });
    await expect(service.getUnreadCount({ actorId: 'user-1' })).resolves.toBe(
      0,
    );
  });

  it('creates and applies Provider labels while maintaining local membership', async () => {
    await store.commitSyncBatch({
      accountId: 'account-1',
      folders: [],
      messages: [message('provider-label', 'Label me')],
      deletedProviderMessageIds: [],
      nextCursor: { value: 'label-test' },
    });
    const stored = (await store.listMessages('user-1', {})).items[0];
    const createLabel = vi.fn<NonNullable<MailProviderAdapter['createLabel']>>(
      async (name) => ({
        ok: true,
        value: {
          providerFolderId: 'label-project',
          type: 'custom',
          name,
          kind: 'label',
        },
      }),
    );
    const updateLabels = vi.fn<
      NonNullable<MailProviderAdapter['updateLabels']>
    >(async () => ({ ok: true, value: undefined }));
    const service = new DefaultMailService({
      store,
      adapters: resolver({
        ...baseAdapter(),
        capabilities: { ...baseAdapter().capabilities, labels: true },
        createLabel,
        updateLabels,
      }),
      outbox: { kick: vi.fn() },
    });

    await expect(
      service.createLabel({ actorId: 'user-1' }, 'account-1', 'Project'),
    ).resolves.toMatchObject({ providerFolderId: 'label-project' });
    await expect(
      service.updateMessageLabels(
        { actorId: 'user-1' },
        {
          accountId: 'account-1',
          messageId: stored.id,
          addLabelIds: ['label-project'],
        },
      ),
    ).resolves.toMatchObject({
      folderIds: expect.arrayContaining(['inbox', 'label-project']),
    });
    expect(updateLabels).toHaveBeenCalledWith('provider-label', {
      addLabelIds: ['label-project'],
      removeLabelIds: [],
      signal: undefined,
    });
  });

  it('selects a managed signature and supports cancelling and retrying sync', async () => {
    const setupService = new DefaultMailService({
      store,
      adapters: resolver(baseAdapter()),
      outbox: { kick: vi.fn() },
    });
    const signature = await setupService.saveSignature(
      { actorId: 'user-1' },
      {
        accountId: 'account-1',
        identityId: 'identity-1',
        name: 'Sales',
        text: 'Sales team',
      },
    );
    expect(signature).toMatchObject({
      isDefault: true,
      createdAt: expect.any(String),
    });
    const sendMessage = vi.fn<NonNullable<MailProviderAdapter['sendMessage']>>(
      async () => ({ status: 'accepted' }),
    );
    const service = new DefaultMailService({
      store,
      adapters: resolver({ ...baseAdapter(), sendMessage }),
      outbox: { kick: vi.fn() },
    });
    await service.sendMessage(
      { actorId: 'user-1' },
      {
        accountId: 'account-1',
        identityId: 'identity-1',
        signatureId: signature.id,
        to: [{ address: 'reader@example.com' }],
        subject: 'Signed',
        text: 'Hello',
        idempotencyKey: 'signed-message',
      },
    );
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({ text: 'Hello\n\n-- \nSales team' }),
      }),
    );
    const alternate = await service.saveSignature(
      { actorId: 'user-1' },
      {
        accountId: 'account-1',
        identityId: 'identity-1',
        name: 'Support',
        text: 'Support team',
      },
    );
    await service.sendMessage(
      { actorId: 'user-1' },
      {
        accountId: 'account-1',
        identityId: 'identity-1',
        signatureId: alternate.id,
        to: [{ address: 'reader@example.com' }],
        subject: 'Switched signature',
        text: 'Hello\n\n-- \nSales team',
        idempotencyKey: 'switched-signature',
      },
    );
    expect(sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          text: 'Hello\n\n-- \nSupport team',
        }),
      }),
    );

    const run = await service.startSync(
      { actorId: 'user-1' },
      { accountId: 'account-1' },
    );
    await expect(
      service.cancelSyncRun({ actorId: 'user-1' }, run.id),
    ).resolves.toMatchObject({ status: 'cancelled' });
    await expect(
      service.retrySyncRun({ actorId: 'user-1' }, run.id),
    ).resolves.toMatchObject({ status: 'pending', accountId: 'account-1' });
  });

  it('moves a soft-deleted message to the local trash folder', async () => {
    await store.commitSyncBatch({
      accountId: 'account-1',
      folders: [
        {
          providerFolderId: 'trash',
          type: 'trash',
          name: 'Trash',
          kind: 'folder',
        },
      ],
      messages: [message('provider-soft-delete', 'Soft delete')],
      deletedProviderMessageIds: [],
      nextCursor: { value: 'soft-delete-test' },
    });
    const stored = await store.listMessages('user-1', {});
    const moveMessage = vi.fn<NonNullable<MailProviderAdapter['moveMessage']>>(
      async () => ({
        ok: true,
        value: { providerMessageId: 'provider-soft-delete-moved' },
      }),
    );
    const deleteMessage = vi.fn<
      NonNullable<MailProviderAdapter['deleteMessage']>
    >(async () => ({ ok: true, value: undefined }));
    const service = new DefaultMailService({
      store,
      adapters: resolver({
        ...baseAdapter(),
        capabilities: { ...baseAdapter().capabilities, moveMessage: true },
        moveMessage,
        deleteMessage,
      }),
      outbox: { kick: vi.fn() },
    });

    await service.deleteMessage(
      { actorId: 'user-1' },
      { accountId: 'account-1', messageId: stored.items[0].id },
    );

    expect(moveMessage).toHaveBeenCalledWith(
      'provider-soft-delete',
      'trash',
      undefined,
    );
    expect(deleteMessage).not.toHaveBeenCalled();
    await expect(
      store.listMessages('user-1', { folderIds: ['trash'] }),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          providerMessageId: 'provider-soft-delete-moved',
          folderIds: ['trash'],
        }),
      ],
    });
  });

  it('downloads only an attachment belonging to the owned message', async () => {
    await store.commitSyncBatch({
      accountId: 'account-1',
      folders: [],
      messages: [
        {
          ...message('provider-with-attachment', 'Attachment'),
          attachments: [
            {
              providerAttachmentId: 'provider-attachment-1',
              fileName: 'report.pdf',
              contentType: 'application/pdf',
              size: 3,
              inline: false,
            },
          ],
        },
      ],
      deletedProviderMessageIds: [],
      nextCursor: { value: 'attachment-test' },
    });
    const stored = await store.listMessages('user-1', {});
    const messageDetails = await store.getMessage(
      'user-1',
      'account-1',
      stored.items[0].id,
    );
    const getAttachment = vi.fn<
      NonNullable<MailProviderAdapter['getAttachment']>
    >(async () => ({
      ok: true,
      value: {
        fileName: 'provider-name',
        contentType: 'application/octet-stream',
        size: 3,
        stream: streamOf('pdf'),
      },
    }));
    const close = vi.fn(async () => undefined);
    const service = new DefaultMailService({
      store,
      adapters: resolver({ ...baseAdapter(), getAttachment, close }),
      outbox: { kick: vi.fn() },
    });

    const content = await service.getAttachment(
      { actorId: 'user-1' },
      'account-1',
      stored.items[0].id,
      messageDetails?.attachments[0].id ?? '',
    );

    expect(content).toMatchObject({
      fileName: 'report.pdf',
      contentType: 'application/pdf',
      size: 3,
    });
    expect(close).not.toHaveBeenCalled();
    expect(await new Response(content.stream).text()).toBe('pdf');
    expect(close).toHaveBeenCalledTimes(1);
    expect(getAttachment).toHaveBeenCalledWith(
      'provider-with-attachment',
      'provider-attachment-1',
      undefined,
    );
    await expect(
      service.getAttachment(
        { actorId: 'user-1' },
        'account-1',
        stored.items[0].id,
        'other-attachment',
      ),
    ).rejects.toThrow('not found');
  });

  it('saves a Provider draft into the synchronized message store', async () => {
    const saveDraft = vi.fn<NonNullable<MailProviderAdapter['saveDraft']>>(
      async (input) => ({
        ok: true,
        value: {
          providerMessageId: 'provider-draft-1',
          providerFolderIds: ['drafts'],
          from: input.identity,
          to: input.message.to,
          cc: input.message.cc,
          bcc: input.message.bcc,
          replyTo: [],
          references: [],
          subject: input.message.subject,
          text: input.message.text,
          read: true,
          starred: false,
          draft: true,
          attachments: [],
        },
      }),
    );
    const service = new DefaultMailService({
      store,
      adapters: resolver({
        ...baseAdapter(),
        capabilities: { ...baseAdapter().capabilities, drafts: true },
        saveDraft,
      }),
      outbox: { kick: vi.fn() },
    });

    const draft = await service.saveDraft(
      { actorId: 'user-1' },
      {
        accountId: 'account-1',
        identityId: 'identity-1',
        to: [],
        subject: 'Draft subject',
        text: 'Draft body',
        idempotencyKey: 'draft-request-1',
      },
    );

    expect(draft).toMatchObject({
      providerMessageId: 'provider-draft-1',
      subject: 'Draft subject',
      draft: true,
    });
    await expect(store.listMessages('user-1', {})).resolves.toMatchObject({
      items: [
        expect.objectContaining({ providerMessageId: 'provider-draft-1' }),
      ],
    });
  });

  it('updates account lifecycle and promotes a replacement default', async () => {
    await store.saveAccount({
      ...account(),
      id: 'account-2',
      address: 'secondary@example.com',
      credentialReference: 'secret:secondary',
      isDefault: false,
    });
    const deleteCredential = vi.fn(async () => undefined);
    const deletePushSubscription = vi.fn<
      NonNullable<MailProviderAdapter['deletePushSubscription']>
    >(async () => ({ ok: true, value: undefined }));
    const credentials = {
      delete: deleteCredential,
    } as unknown as MailCredentialVault;
    const service = new DefaultMailService({
      store,
      adapters: resolver({ ...baseAdapter(), deletePushSubscription }),
      outbox: { kick: vi.fn() },
      credentials,
    });

    await expect(
      service.updateAccount(
        { actorId: 'user-1' },
        { accountId: 'account-1', status: 'suspended' },
      ),
    ).resolves.toMatchObject({ status: 'suspended' });
    await expect(
      service.updateAccount(
        { actorId: 'user-1' },
        { accountId: 'account-1', status: 'active' },
      ),
    ).resolves.toMatchObject({ status: 'active' });
    await expect(
      service.updateAccount(
        { actorId: 'user-1' },
        { accountId: 'account-2', isDefault: true },
      ),
    ).resolves.toMatchObject({ id: 'account-2', isDefault: true });

    await store.savePushSubscription({
      accountId: 'account-2',
      provider: account().provider,
      providerSubscriptionId: 'push-account-2',
      configurationFingerprint: 'disconnect-fingerprint',
      renewAfter: '2099-01-01T00:00:00.000Z',
      expiresAt: '2099-01-02T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
    });

    await service.removeAccount({ actorId: 'user-1' }, 'account-2');

    expect(deletePushSubscription).toHaveBeenCalledWith(
      'push-account-2',
      undefined,
    );
    expect(deleteCredential).toHaveBeenCalledWith('secret:secondary');
    await expect(service.listAccounts({ actorId: 'user-1' })).resolves.toEqual([
      expect.objectContaining({ id: 'account-1', isDefault: true }),
    ]);
  });

  it('lists every account for management without granting cross-user sync', async () => {
    await store.saveAccount({
      ...account(),
      id: 'account-2',
      userId: 'user-2',
      address: 'other@example.com',
    });
    const service = new DefaultMailService({
      store,
      adapters: resolver(baseAdapter()),
      outbox: { kick: vi.fn() },
    });
    await store.createSyncRun({
      id: 'sync-account-2',
      accountId: 'account-2',
      requestedBy: 'user-2',
      mode: 'initial',
      policy: { maxMessages: 100, batchSize: 20 },
    });
    await store.createSubmission(
      {
        id: 'submission-account-2',
        accountId: 'account-2',
        status: 'accepted',
      },
      'operation-log-test',
      'operation-log-test-fingerprint',
    );

    await expect(
      service.listManagedAccounts({ actorId: 'user-1' }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'account-1',
        userId: 'user-1',
        canSync: true,
      }),
      expect.objectContaining({
        id: 'account-2',
        userId: 'user-2',
        canSync: false,
      }),
    ]);
    await expect(
      service.listManagedOperationLogs({ actorId: 'user-1' }),
    ).resolves.toMatchObject({
      accounts: [
        expect.objectContaining({ id: 'account-1', userId: 'user-1' }),
        expect.objectContaining({ id: 'account-2', userId: 'user-2' }),
      ],
      syncRuns: [expect.objectContaining({ accountId: 'account-2' })],
      submissions: [expect.objectContaining({ accountId: 'account-2' })],
    });
  });

  it('resumes a pending submission after interruption before claiming', async () => {
    const sendMessage = vi.fn<MailProviderAdapter['sendMessage']>(async () => ({
      status: 'accepted',
      providerMessageId: 'provider-sent-after-resume',
    }));
    const claim = vi.spyOn(store, 'claimSubmission');
    claim.mockResolvedValueOnce(false);
    const service = new DefaultMailService({
      store,
      adapters: resolver({ ...baseAdapter(), sendMessage }),
      outbox: { kick: vi.fn() },
    });
    const input = {
      accountId: 'account-1',
      identityId: 'identity-1',
      to: [{ address: 'recipient@example.com' }],
      subject: 'Resume me',
      text: 'Mail body',
      idempotencyKey: 'interrupted-before-claim',
    } as const;

    const interrupted = await service.sendMessage({ actorId: 'user-1' }, input);
    const resumed = await service.sendMessage({ actorId: 'user-1' }, input);

    expect(interrupted.status).toBe('pending');
    expect(resumed).toMatchObject({
      status: 'accepted',
      providerMessageId: 'provider-sent-after-resume',
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
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
    await expect(
      service.listSyncRuns({ actorId: 'user-1' }),
    ).resolves.toMatchObject([
      {
        id: created.id,
        accountId: 'account-1',
        status: 'completed',
      },
    ]);

    const next = await service.startSync(
      { actorId: 'user-1' },
      { accountId: 'account-1' },
    );
    expect(next.mode).toBe('incremental');
  });

  it('re-establishes the baseline once when an initial catch-up cursor expires', async () => {
    const getCurrentSyncCursor = vi
      .fn<NonNullable<MailProviderAdapter['getCurrentSyncCursor']>>()
      .mockResolvedValueOnce({
        ok: true,
        value: { value: 'watermark-before-import' },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { value: 'watermark-after-import' },
      });
    const listChanges = vi
      .fn<NonNullable<MailProviderAdapter['listChanges']>>()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'TEST_SYNC_CURSOR_INVALID',
          message: 'The cursor expired.',
          category: 'provider',
          retryable: false,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          messages: [],
          deletedProviderMessageIds: [],
          nextCursor: { value: 'watermark-after-import' },
          hasMore: false,
        },
      });
    const adapters = resolver({
      ...baseAdapter(),
      getCurrentSyncCursor,
      listMessages: async () => ({ ok: true, value: { messages: [] } }),
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
      { accountId: 'account-1', batchSize: 100 },
    );

    for (let step = 0; step < 3; step += 1) {
      await runtime.publishPending();
    }

    expect(await store.getSyncRun(created.id)).toMatchObject({
      status: 'completed',
      phase: 'completed',
      changeCursor: { value: 'watermark-after-import' },
    });
    expect(getCurrentSyncCursor).toHaveBeenCalledTimes(2);
    expect(listChanges).toHaveBeenNthCalledWith(1, {
      cursor: { value: 'watermark-before-import' },
      limit: 100,
    });
    expect(listChanges).toHaveBeenNthCalledWith(2, {
      cursor: { value: 'watermark-after-import' },
      limit: 100,
    });
  });

  it('filters synchronized messages by folder and provider conversation', async () => {
    await store.commitSyncBatch({
      accountId: 'account-1',
      folders: [
        {
          providerFolderId: 'inbox',
          type: 'inbox',
          name: 'Inbox',
          kind: 'folder',
        },
        {
          providerFolderId: 'sent',
          type: 'sent',
          name: 'Sent',
          kind: 'folder',
        },
      ],
      messages: [
        {
          ...message('thread-message-1', 'Project update'),
          providerConversationId: 'conversation-1',
        },
        {
          ...message('thread-message-2', 'Re: Project update'),
          providerConversationId: 'conversation-1',
          providerFolderIds: ['sent'],
          receivedAt: '2026-09-04T00:00:00.000Z',
        },
        message('standalone-message', 'Standalone'),
      ],
      deletedProviderMessageIds: [],
      nextCursor: { value: 'cursor-1' },
    });

    const inbox = await store.listMessages('user-1', {
      accountIds: ['account-1'],
      folderIds: ['inbox'],
    });
    const conversation = await store.listConversationMessages(
      'user-1',
      'account-1',
      'conversation-1',
    );

    expect(inbox.items.map((item) => item.providerMessageId)).toEqual(
      expect.arrayContaining(['thread-message-1', 'standalone-message']),
    );
    expect(inbox.items).toHaveLength(2);
    expect(conversation.items.map((item) => item.providerMessageId)).toEqual([
      'thread-message-1',
      'thread-message-2',
    ]);
  });

  it('uses stable keyset cursors for mailbox and conversation pages', async () => {
    await store.commitSyncBatch({
      accountId: 'account-1',
      folders: [],
      messages: [
        {
          ...message('thread-message-1', 'Project update'),
          providerConversationId: 'conversation-1',
          receivedAt: '2026-09-01T00:00:00.000Z',
        },
        {
          ...message('thread-message-2', 'Re: Project update'),
          providerConversationId: 'conversation-1',
          receivedAt: '2026-09-02T00:00:00.000Z',
        },
        {
          ...message('thread-message-3', 'Re: Project update'),
          providerConversationId: 'conversation-1',
          receivedAt: '2026-09-03T00:00:00.000Z',
        },
      ],
      deletedProviderMessageIds: [],
      nextCursor: { value: 'cursor-1' },
    });

    const mailboxFirst = await store.listMessages('user-1', {
      accountIds: ['account-1'],
      limit: 1,
    });
    const mailboxSecond = await store.listMessages('user-1', {
      accountIds: ['account-1'],
      cursor: mailboxFirst.nextCursor,
      limit: 1,
    });
    const conversationFirst = await store.listConversationMessages(
      'user-1',
      'account-1',
      'conversation-1',
      { limit: 1 },
    );
    const conversationSecond = await store.listConversationMessages(
      'user-1',
      'account-1',
      'conversation-1',
      { cursor: conversationFirst.nextCursor, limit: 1 },
    );

    expect([
      mailboxFirst.items[0].providerMessageId,
      mailboxSecond.items[0].providerMessageId,
    ]).toEqual(['thread-message-3', 'thread-message-2']);
    expect([
      conversationFirst.items[0].providerMessageId,
      conversationSecond.items[0].providerMessageId,
    ]).toEqual(['thread-message-3', 'thread-message-2']);
    await expect(
      store.listMessages('user-1', { cursor: 'not-a-cursor' }),
    ).rejects.toThrow(TypeError);
  });

  it('keeps message folder JSON aligned after folder reconciliation', async () => {
    await store.commitSyncBatch({
      accountId: 'account-1',
      folders: [
        {
          providerFolderId: 'inbox',
          type: 'inbox',
          name: 'Inbox',
          kind: 'folder',
        },
        {
          providerFolderId: 'archive',
          type: 'archive',
          name: 'Archive',
          kind: 'folder',
        },
      ],
      messages: [
        {
          ...message('message-1', 'Project update'),
          providerFolderIds: ['inbox', 'archive'],
        },
      ],
      deletedProviderMessageIds: [],
      nextCursor: { value: 'cursor-1' },
    });
    const pending = await store.createSyncRun({
      id: 'sync-folder-reconciliation',
      accountId: 'account-1',
      requestedBy: 'user-1',
      mode: 'initial',
      policy: { maxMessages: 100, batchSize: 10 },
    });
    const running = await store.claimSyncRun(
      pending.id,
      pending.revision,
      pending.phase,
      'folder-reconciliation-lease',
      new Date(Date.now() + 10_000).toISOString(),
    );
    expect(running).toBeDefined();
    await store.commitSyncStep({
      run: running!,
      folders: [],
      completeProviderFolderIds: ['inbox'],
      messages: [],
      phase: 'history',
      status: 'running',
      createNextTask: false,
    });

    const stored = await store.listMessages('user-1', {
      accountIds: ['account-1'],
    });
    expect(stored.items[0].folderIds).toEqual(['inbox']);
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

  it('renews the sync-run lease while a Provider request is still running', async () => {
    const entered = Promise.withResolvers<void>();
    const providerGate = Promise.withResolvers<void>();
    const adapters = resolver({
      ...baseAdapter(),
      getCurrentSyncCursor: async () => {
        entered.resolve();
        await providerGate.promise;
        return { ok: true, value: { value: 'watermark-1' } };
      },
      listMessages: async () => ({ ok: true, value: { messages: [] } }),
    });
    const service = new DefaultMailService({
      store,
      adapters,
      outbox: { kick: vi.fn() },
    });
    await service.startSync({ actorId: 'user-1' }, { accountId: 'account-1' });
    const outbox = await store.claimOutbox(
      new Date().toISOString(),
      'heartbeat-outbox-lease',
      new Date(Date.now() + 10_000).toISOString(),
      1,
    );
    await store.markOutboxPublished(
      outbox[0].id,
      outbox[0].leaseToken ?? '',
      new Date().toISOString(),
    );
    const renew = vi.spyOn(store, 'renewSyncRunLease');
    vi.useFakeTimers({ now: new Date() });
    const operation = new SyncMailboxOperation({
      store,
      adapters,
      leaseMs: 3_000,
    });

    const running = operation.execute(outbox[0].payload);
    await entered.promise;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(renew).toHaveBeenCalledTimes(1);
    providerGate.resolve();
    await running;
  });

  it('clears an expired Provider cursor so the next sync can rebootstrap', async () => {
    await store.commitSyncBatch({
      accountId: 'account-1',
      folders: [],
      messages: [],
      deletedProviderMessageIds: [],
      nextCursor: { value: 'expired-cursor' },
    });
    const adapters = resolver({
      ...baseAdapter(),
      listFolders: async () => ({
        ok: true,
        value: { folders: [], completeProviderFolderIds: [] },
      }),
      listChanges: async () => ({
        ok: false,
        error: {
          code: 'TEST_SYNC_CURSOR_INVALID',
          message: 'The cursor expired.',
          category: 'provider',
          retryable: false,
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
    const task = await store.claimOutbox(
      new Date().toISOString(),
      'cursor-outbox-lease',
      new Date(Date.now() + 10_000).toISOString(),
      1,
    );
    await store.markOutboxPublished(
      task[0].id,
      task[0].leaseToken ?? '',
      new Date().toISOString(),
    );
    const operation = new SyncMailboxOperation({ store, adapters });

    await operation.execute(task[0].payload);
    const nextTask = await store.claimOutbox(
      new Date().toISOString(),
      'cursor-next-outbox-lease',
      new Date(Date.now() + 10_000).toISOString(),
      1,
    );
    await operation.execute(nextTask[0].payload);

    expect(await store.getSyncRun(created.id)).toMatchObject({
      status: 'failed',
      error: { code: 'TEST_SYNC_CURSOR_INVALID' },
    });
    expect(await store.getSyncCursor('account-1')).toBeUndefined();
    const restarted = await service.startSync(
      { actorId: 'user-1' },
      { accountId: 'account-1' },
    );
    expect(restarted.mode).toBe('initial');
  });

  it('marks an account for reauthorization after a terminal auth failure', async () => {
    const sendMessage = vi.fn<MailProviderAdapter['sendMessage']>(async () => ({
      status: 'failed',
      error: {
        code: 'TEST_OAUTH_INVALID_GRANT',
        message: 'The refresh token was revoked.',
        category: 'authentication',
        retryable: false,
      },
    }));
    const service = new DefaultMailService({
      store,
      adapters: resolver({ ...baseAdapter(), sendMessage }),
      outbox: { kick: vi.fn() },
    });

    await service.sendMessage(
      { actorId: 'user-1' },
      {
        accountId: 'account-1',
        identityId: 'identity-1',
        to: [{ address: 'recipient@example.com' }],
        subject: 'Authentication failure',
        text: 'Mail body',
        idempotencyKey: 'auth-failure',
      },
    );

    expect(await store.getAccount('account-1')).toMatchObject({
      status: 'reauthorizationRequired',
    });
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

function streamOf(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}
