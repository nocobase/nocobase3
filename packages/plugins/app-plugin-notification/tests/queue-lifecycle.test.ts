import { createQueueService } from '@nocobase/queue';
import { createLogger } from '@nocobase/logging';
import type { DatabaseManager } from '@nocobase/db';
import { expect, it, vi } from 'vitest';
import { createNotificationManager } from '../server/manager.js';
import { FakeNotificationStore } from './helpers/fake-notification-store.js';

it('registers without database access and awaits delivery before closing its provider', async () => {
  const queue = createQueueService({ namespace: 'notification-close-order' });
  const store = new FakeNotificationStore();
  const listReady = vi.spyOn(store, 'listReady');
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const closed = vi.fn(async () => undefined);
  const manager = createNotificationManager({
    database: {} as DatabaseManager,
    queue,
    store,
    logger: createLogger({ level: 'silent' }),
    config: {
      channels: [
        {
          type: 'email',
          enabled: true,
          providers: [{ type: 'test', name: 'primary' }],
        },
      ],
    },
  });
  manager.registry.registerChannel({
    type: 'email',
    async createChannel() {
      return {
        type: 'email',
        resolveRecipient({ recipient }) {
          return recipient?.type === 'email'
            ? { address: recipient.address }
            : undefined;
        },
        render({ content }) {
          return { text: content.body };
        },
        async prepare(input) {
          return input.message;
        },
      };
    },
  });
  manager.registry.registerProvider('email', {
    type: 'test',
    async createProvider(_context, config) {
      return {
        type: config.type,
        name: config.name,
        async send() {
          entered.resolve();
          await release.promise;
          return { status: 'accepted' } as const;
        },
        close: closed,
      };
    },
  });
  try {
    manager.registerDeliveryHandler();
    expect(listReady).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
    await queue.setup();
    await manager.start();
    await manager.send({
      idempotencyKey: 'close-order',
      to: { type: 'email', address: 'test@example.com' },
      channels: ['email'],
      content: { body: 'Test' },
    });
    await entered.promise;
    const closing = manager.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(closed).not.toHaveBeenCalled();
    release.resolve();
    await closing;
    expect(closed).toHaveBeenCalledOnce();
  } finally {
    release.resolve();
    await manager.close();
    await queue.shutdown();
  }
});
