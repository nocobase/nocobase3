import { createLogger } from '@nocobase/logging';
import { describe, expect, it, vi } from 'vitest';

import { ChannelManager } from '../server/channel-manager.js';
import {
  type NotificationDeliveryRecord,
  type NotificationLogRecord,
} from '../server/store.js';
import { FakeNotificationStore } from './helpers/fake-notification-store.js';

describe('ChannelManager', () => {
  it('resolves primary, explicit, and broadcast Provider selections', async () => {
    const manager = new ChannelManager({
      logger: createLogger({ level: 'silent' }),
      store: new FakeNotificationStore(),
    });
    manager.register('email', {
      channel: {
        type: 'email',
        async prepare(input): Promise<object> {
          return input.message;
        },
      },
      providers: [
        {
          name: 'secondary',
          type: 'fake',
          async send() {
            return { status: 'accepted' };
          },
        },
        {
          name: 'primary',
          type: 'fake',
          async send() {
            return { status: 'accepted' };
          },
        },
      ],
    });

    expect(manager.providerIdentities('email')).toEqual([
      { name: 'primary', type: 'fake' },
    ]);
    expect(
      manager.providerIdentities('email', { providerName: 'secondary' }),
    ).toEqual([{ name: 'secondary', type: 'fake' }]);
    expect(
      manager.providerIdentities('email', { providerMode: 'broadcast' }),
    ).toEqual([
      { name: 'secondary', type: 'fake' },
      { name: 'primary', type: 'fake' },
    ]);
    expect(manager.providerCandidates('email')).toEqual([
      { name: 'primary', type: 'fake' },
      { name: 'secondary', type: 'fake' },
    ]);
    await expect(
      manager.resolveRecipient(
        'email',
        { type: 'phone', number: '123' },
        { name: 'primary', type: 'fake' },
      ),
    ).resolves.toBeUndefined();
  });

  it('does not invoke another Provider when submission result is unknown', async () => {
    const store = new FakeNotificationStore();
    const delivery = await seed(store);
    const next = vi.fn(async () => ({ status: 'accepted' }) as const);
    const manager = new ChannelManager({
      logger: createLogger({ level: 'silent' }),
      store,
    });
    manager.register('email', {
      channel: {
        type: 'email',
        async prepare(input): Promise<object> {
          return input.message;
        },
      },
      providers: [
        {
          name: 'primary',
          type: 'fake',
          async send() {
            return {
              status: 'submission_unknown',
              error: { message: 'connection closed after submit' },
            };
          },
        },
        { name: 'secondary', type: 'fake', send: next },
      ],
    });

    expect((await manager.send(delivery.id))?.status).toBe('unknown');
    expect(next).not.toHaveBeenCalled();
  });

  it('matches the persisted Provider by its unique name', async () => {
    const store = new FakeNotificationStore();
    const delivery = await seed(store);
    const primary = vi.fn(async () => ({ status: 'accepted' }) as const);
    const secondary = vi.fn(async () => ({ status: 'accepted' }) as const);
    const manager = new ChannelManager({
      logger: createLogger({ level: 'silent' }),
      store,
    });
    manager.register('email', {
      channel: {
        type: 'email',
        async prepare(input): Promise<object> {
          return input.message;
        },
      },
      providers: [
        { name: 'secondary', type: 'fake', send: secondary },
        { name: 'primary', type: 'fake', send: primary },
      ],
    });

    expect((await manager.send(delivery.id))?.status).toBe('accepted');
    expect(primary).toHaveBeenCalledOnce();
    expect(secondary).not.toHaveBeenCalled();
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
        async prepare(input): Promise<object> {
          return input.message;
        },
      },
      providers: [{ name: 'primary', type: 'replacement', send }],
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
      retry: { initialDelayMs: 0, jitterRatio: 0 },
    });
    manager.register('email', {
      channel: {
        type: 'email',
        async prepare(input): Promise<object> {
          return input.message;
        },
      },
      providers: [
        {
          name: 'primary',
          type: 'fake',
          async send() {
            calls += 1;
            return calls === 1
              ? {
                  status: 'failed',
                  error: { message: 'temporarily unavailable' },
                  disposition: 'same_provider',
                  retryAfterMs: 0,
                }
              : { status: 'accepted' };
          },
        },
      ],
    });

    const scheduled = await manager.send(delivery.id);
    expect(scheduled).toMatchObject({ status: 'failed' });
    expect(scheduled?.nextRunAt).toBeDefined();

    const accepted = await manager.send(delivery.id);
    expect(accepted?.status).toBe('accepted');
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
        async prepare(input): Promise<object> {
          return input.message;
        },
      },
      providers: [
        {
          name: 'primary',
          type: 'fake',
          async send() {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return { status: 'accepted' } as const;
          },
        },
      ],
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
    channel: 'email',
    recipientSnapshot: { address: 'test@example.com' },
    messageSnapshot: { subject: 'Hello' },
    providerName: 'primary',
    providerType: 'fake',
    attemptCount: 0,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  await store.create({ log, deliveries: [delivery] });
  return delivery;
}
