import { createLogger } from '@nocobase/logging';
import { describe, expect, it, vi } from 'vitest';

import { ChannelManager } from '../src/channel-manager.js';
import {
  type NotificationDeliveryRecord,
  type NotificationLogRecord,
} from '../src/store.js';
import { FakeNotificationStore } from './helpers/fake-notification-store.js';

describe('ChannelManager', () => {
  it('tries Providers in configured order without retrying one Provider', async () => {
    const store = new FakeNotificationStore();
    const delivery = await seed(store);
    const first = vi.fn(
      async () =>
        ({
          status: 'failed',
          error: { message: 'primary unavailable' },
          disposition: 'next_provider',
        }) as const,
    );
    const second = vi.fn(
      async () =>
        ({ status: 'accepted', providerMessageId: 'remote-1' }) as const,
    );
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
        { name: 'primary', type: 'fake', send: first },
        { name: 'secondary', type: 'fake', send: second },
      ],
    });

    const result = await manager.send(delivery.id);

    expect(result?.status).toBe('accepted');
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(await store.listAttempts(delivery.id)).toHaveLength(2);
  });

  it('stops fallback when submission result is unknown', async () => {
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

  it('uses the snapshotted Provider chain after configuration order changes', async () => {
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

  it('persists a same-Provider retry and reuses the Delivery idempotency key', async () => {
    const store = new FakeNotificationStore();
    const delivery = await seed(store);
    const keys: string[] = [];
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
          async send(input) {
            keys.push(input.idempotencyKey);
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
    expect(keys).toEqual([delivery.idempotencyKey, delivery.idempotencyKey]);
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
    idempotencyKey: `notification-1:${crypto.randomUUID()}`,
    createdAt: now,
    updatedAt: now,
  };
  const delivery: NotificationDeliveryRecord = {
    id: crypto.randomUUID(),
    notificationId: log.id,
    channel: 'email',
    recipientKey: 'user-1',
    recipientSnapshot: { address: 'test@example.com' },
    messageSnapshot: { subject: 'Hello' },
    providerChain: ['primary', 'secondary'],
    providerCursor: 0,
    attemptCount: 0,
    status: 'pending',
    idempotencyKey: `${log.id}:${crypto.randomUUID()}`,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  await store.create({ log, deliveries: [delivery] });
  return delivery;
}
