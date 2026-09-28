import { createLogger } from '@nocobase/logging';
import { describe, expect, it, vi } from 'vitest';

import { ChannelManager } from '../server/channel-manager.js';
import {
  type NotificationDeliveryRecord,
  type NotificationLogRecord,
} from '../server/store.js';
import { FakeNotificationStore } from './helpers/fake-notification-store.js';

describe('ChannelManager', () => {
  it('records queued deliveries as failed when the registered channel type differs', async () => {
    const store = new FakeNotificationStore();
    const delivery = await seed(store);
    const send = vi.fn();
    const manager = new ChannelManager({
      store,
      logger: createLogger({ level: 'silent' }),
    });
    manager.register('email', {
      channel: {
        type: 'im',
        validateMessage: (message: object) => ({ message, recipients: [{}] }),
        prepare: async ({ message }) => message,
      },
      provider: { type: 'fake', send },
    });
    expect(await manager.send(delivery.id)).toMatchObject({
      status: 'failed',
      lastError: { code: 'PROVIDER_UNAVAILABLE' },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('records queued deliveries as failed after the configured channel type changes', async () => {
    const store = new FakeNotificationStore();
    const delivery = await seed(store);
    const send = vi.fn();
    const manager = new ChannelManager({
      store,
      logger: createLogger({ level: 'silent' }),
    });
    manager.register('email', {
      channel: {
        type: 'im',
        validateMessage: (message: object) => ({ message, recipients: [{}] }),
        prepare: async ({ message }) => message,
      },
      provider: { type: 'fake', send },
    });
    expect(await manager.send(delivery.id)).toMatchObject({
      status: 'failed',
      lastError: {
        code: 'PROVIDER_UNAVAILABLE',
        message: 'Notification Channel "email" type has changed.',
      },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('does not invoke another Provider when submission result is unknown', async () => {
    const store = new FakeNotificationStore();
    const delivery = await seed(store);
    const manager = new ChannelManager({
      logger: createLogger({ level: 'silent' }),
      store,
    });
    manager.register('email', {
      channel: {
        type: 'email',
        validateMessage: (message: object) => ({ message, recipients: [{}] }),
        async prepare(input): Promise<object> {
          return input.message;
        },
      },
      provider: {
        type: 'fake',
        async send() {
          return {
            status: 'submission_unknown',
            error: { message: 'connection closed after submit' },
          };
        },
      },
    });

    expect((await manager.send(delivery.id))?.status).toBe('unknown');
  });

  it('rejects a Provider whose type no longer matches the Delivery', async () => {
    const store = new FakeNotificationStore();
    const delivery = await seed(store);
    const send = vi.fn(async () => ({ status: 'accepted' }) as const);
    const manager = new ChannelManager({
      logger: createLogger({ level: 'silent' }),
      store,
    });
    manager.register('email', {
      channel: {
        type: 'email',
        validateMessage: (message: object) => ({ message, recipients: [{}] }),
        async prepare(input): Promise<object> {
          return input.message;
        },
      },
      provider: { type: 'replacement', send },
    });

    expect(await manager.send(delivery.id)).toMatchObject({
      status: 'failed',
      lastError: { code: 'PROVIDER_UNAVAILABLE' },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('persists a same-Provider retry', async () => {
    const store = new FakeNotificationStore();
    const delivery = await seed(store);
    let calls = 0;
    const manager = new ChannelManager({
      logger: createLogger({ level: 'silent' }),
      store,
      retry: { maxAttempts: 2, intervalMs: 0 },
    });
    manager.register('email', {
      channel: {
        type: 'email',
        validateMessage: (message: object) => ({ message, recipients: [{}] }),
        async prepare(input): Promise<object> {
          return input.message;
        },
      },
      provider: {
        type: 'fake',
        async send() {
          calls += 1;
          return calls === 1
            ? {
                status: 'failed',
                error: { message: 'temporarily unavailable' },
                disposition: 'same_provider',
              }
            : { status: 'accepted' };
        },
      },
    });

    const scheduled = await manager.send(delivery.id);
    expect(scheduled).toMatchObject({ status: 'retrying' });
    expect(scheduled?.nextRunAt).toBeDefined();

    const accepted = await manager.send(delivery.id);
    expect(accepted?.status).toBe('accepted');
  });

  it('does not retry by default', async () => {
    const store = new FakeNotificationStore();
    const delivery = await seed(store);
    const send = vi.fn(async (): Promise<ProviderSendResult> => ({
      status: 'failed',
      error: { message: 'temporarily unavailable' },
      disposition: 'same_provider',
    }));
    const manager = new ChannelManager({
      logger: createLogger({ level: 'silent' }),
      store,
    });
    manager.register('email', {
      channel: {
        type: 'email',
        validateMessage: (message: object) => ({ message, recipients: [{}] }),
        async prepare(input): Promise<object> {
          return input.message;
        },
      },
      provider: { type: 'fake', send },
    });

    await expect(manager.send(delivery.id)).resolves.toMatchObject({
      status: 'failed',
      nextRunAt: undefined,
    });
    await expect(manager.send(delivery.id)).resolves.toMatchObject({
      status: 'failed',
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it('marks a timed-out Provider submission as unknown', async () => {
    const store = new FakeNotificationStore();
    const delivery = await seed(store);
    const manager = new ChannelManager({
      logger: createLogger({ level: 'silent' }),
      store,
      providerTimeoutMs: 5,
    });
    manager.register('email', {
      channel: {
        type: 'email',
        validateMessage: (message: object) => ({ message, recipients: [{}] }),
        async prepare(input): Promise<object> {
          return input.message;
        },
      },
      provider: {
        type: 'fake',
        async send() {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { status: 'accepted' } as const;
        },
      },
    });

    expect((await manager.send(delivery.id))?.status).toBe('unknown');
  });
});

async function seed(
  store: FakeNotificationStore,
): Promise<NotificationDeliveryRecord> {
  const now = await store.now();
  const log: NotificationLogRecord = {
    id: 'notification-1',
    sourceType: 'test',
    messageSnapshot: { email: { subject: 'Hello' } },
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  const delivery: NotificationDeliveryRecord = {
    id: crypto.randomUUID(),
    notificationId: log.id,
    channelName: 'email',
    channelType: 'email',
    recipientSnapshot: { address: 'test@example.com' },
    messageSnapshot: { subject: 'Hello' },
    providerType: 'fake',
    attemptCount: 0,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  await store.create({ log, deliveries: [delivery] });
  return delivery;
}

it('finishes unavailable queued Channels without repeatedly re-enqueueing them', async () => {
  const store = new FakeNotificationStore();
  const delivery = await seed(store);
  const manager = new ChannelManager({
    store,
    logger: createLogger({ level: 'silent' }),
    resolveRuntime: async () => {
      throw new Error('Channel is disabled');
    },
  });
  expect(await manager.send(delivery.id)).toMatchObject({
    status: 'failed',
    nextRunAt: undefined,
    lastError: { code: 'PROVIDER_UNAVAILABLE' },
  });
  expect(await store.listReady(await store.now())).toEqual([]);
  expect(await store.listAttempts(delivery.id)).toEqual([]);
});
