import { createLogger, type DestinationStream } from '@nocobase/logging';
import { createQueueManager, createSyncQueueConfig } from '@nocobase/queue';
import { describe, expect, it, vi } from 'vitest';

import { createNotificationManager } from '../src/manager.js';
import type { NotificationDeliveryRecord } from '../src/store.js';
import { createNotificationTestDatabase } from './helpers/database.js';
import { FakeNotificationStore } from './helpers/fake-notification-store.js';

describe('NotificationManager registration', () => {
  it('closes Providers when a later Provider fails during startup', async () => {
    const queue = createQueueManager(createSyncQueueConfig());
    const database = await createNotificationTestDatabase();
    const close = vi.fn(async () => undefined);
    const manager = createNotificationManager({
      database,
      queue,
      logger: createLogger({ level: 'silent' }),
      config: {
        channels: [
          {
            type: 'email',
            enabled: true,
            providers: [
              { type: 'working', name: 'primary' },
              { type: 'broken', name: 'secondary' },
            ],
          },
        ],
      },
      store: new FakeNotificationStore(),
    });
    manager.registerChannel({
      type: 'email',
      async createChannel() {
        return {
          type: 'email',
          async prepare(input): Promise<object> {
            return input.message;
          },
        };
      },
    });
    manager.registerProvider('email', {
      type: 'working',
      async createProvider(_context, config) {
        return {
          name: config.name,
          type: config.type,
          async send() {
            return { status: 'accepted' } as const;
          },
          close,
        };
      },
    });
    manager.registerProvider('email', {
      type: 'broken',
      async createProvider() {
        throw new Error('startup failed');
      },
    });

    await expect(manager.start()).rejects.toThrow('startup failed');
    expect(close).toHaveBeenCalledOnce();

    await queue.close();
    await database.destroy();
  });

  it('emits structured lifecycle logs without notification content', async () => {
    const output = createMemoryDestination();
    const queue = createQueueManager(createSyncQueueConfig());
    const database = await createNotificationTestDatabase();
    const manager = createNotificationManager({
      database,
      queue,
      logger: createLogger({ level: 'debug' }, output),
      config: {
        channels: [
          {
            type: 'email',
            enabled: true,
            providers: [{ type: 'fake', name: 'primary' }],
          },
        ],
      },
      store: new FakeNotificationStore(),
    });

    manager
      .registerChannel({
        type: 'email',
        async createChannel() {
          return {
            type: 'email',
            resolveRecipient(recipient): object {
              return recipient;
            },
            render({ content }): object {
              return { subject: content.title, text: content.body };
            },
            async prepare(input): Promise<object> {
              return input.message;
            },
          };
        },
      })
      .registerProvider('email', {
        type: 'fake',
        async createProvider(_context, config) {
          return {
            name: config.name,
            type: config.type,
            async send() {
              return { status: 'accepted' } as const;
            },
          };
        },
      });

    await manager.start();
    const result = await manager.send({
      source: { type: 'test' },
      to: { type: 'email', address: 'private@example.com' },
      channels: ['email'],
      content: { title: 'private subject', body: 'private body' },
    });
    const details = await manager.logs.get(result.notificationId);
    expect(details?.log).not.toHaveProperty('messageSnapshot');
    expect(details?.deliveries[0]?.delivery).not.toHaveProperty(
      'recipientSnapshot',
    );
    expect(details?.deliveries[0]?.delivery).not.toHaveProperty(
      'messageSnapshot',
    );
    await manager.close();

    const records = output.records();
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'notification.manager.started',
          channelCount: 1,
          providerCount: 1,
        }),
        expect.objectContaining({
          event: 'notification.queued',
          notificationId: result.notificationId,
          sourceType: 'test',
          deliveryCount: 1,
          channels: ['email'],
        }),
        expect.objectContaining({
          event: 'notification.delivery.accepted',
          notificationId: result.notificationId,
          channel: 'email',
          provider: 'primary',
        }),
        expect.objectContaining({
          event: 'notification.manager.closed',
        }),
      ]),
    );
    expect(JSON.stringify(records)).not.toContain('private@example.com');
    expect(JSON.stringify(records)).not.toContain('private subject');

    await queue.close();
    await database.destroy();
  });

  it('expands shared content across recipients and Channels', async () => {
    const queue = createQueueManager(createSyncQueueConfig());
    const database = await createNotificationTestDatabase();
    const store = new FakeNotificationStore();
    const manager = createNotificationManager({
      database,
      queue,
      logger: createLogger({ level: 'silent' }),
      config: {
        channels: [
          {
            type: 'in-app',
            enabled: true,
            providers: [{ type: 'fake', name: 'primary' }],
          },
          {
            type: 'email',
            enabled: true,
            providers: [{ type: 'fake', name: 'primary' }],
          },
        ],
      },
      store,
    });

    for (const channelType of ['in-app', 'email']) {
      manager
        .registerChannel({
          type: channelType,
          async createChannel() {
            return {
              type: channelType,
              resolveRecipient(recipient): object | undefined {
                if (recipient.type === 'user') return { userId: recipient.id };
                if (channelType === 'email' && recipient.type === 'email')
                  return { address: recipient.address };
                return undefined;
              },
              render({ content, override }): object {
                return {
                  title: content.title,
                  body: content.body,
                  ...override,
                };
              },
              async prepare(input): Promise<object> {
                return input.message;
              },
            };
          },
        })
        .registerProvider(channelType, {
          type: 'fake',
          async createProvider(_context, config) {
            return {
              name: config.name,
              type: config.type,
              async send() {
                return { status: 'accepted' } as const;
              },
            };
          },
        });
    }
    await manager.start();

    const result = await manager.send({
      to: [
        { type: 'user', id: 'user-1' },
        { type: 'user', id: 'user-2' },
      ],
      channels: ['in-app', 'email'],
      content: { title: 'Approval complete', body: 'Review the result.' },
      channelOverrides: { email: { title: 'Email subject' } },
    });
    const deliveries = await store.listDeliveries(result.notificationId);

    expect(deliveries).toHaveLength(4);
    expect(
      deliveries.map((delivery) => [
        delivery.channel,
        delivery.recipientSnapshot,
        delivery.messageSnapshot,
      ]),
    ).toEqual([
      [
        'in-app',
        { userId: 'user-1' },
        { title: 'Approval complete', body: 'Review the result.' },
      ],
      [
        'email',
        { userId: 'user-1' },
        { title: 'Email subject', body: 'Review the result.' },
      ],
      [
        'in-app',
        { userId: 'user-2' },
        { title: 'Approval complete', body: 'Review the result.' },
      ],
      [
        'email',
        { userId: 'user-2' },
        { title: 'Email subject', body: 'Review the result.' },
      ],
    ]);

    const partialResult = await manager.send({
      to: { type: 'email', address: 'alice@example.com' },
      channels: ['in-app', 'email'],
      content: { body: 'Mixed recipient support.' },
    });
    const partialDeliveries = await store.listDeliveries(
      partialResult.notificationId,
    );
    expect(partialResult.status).toBe('processing');
    expect(partialDeliveries).toEqual([
      expect.objectContaining({
        channel: 'in-app',
        status: 'failed',
        lastError: {
          code: 'RECIPIENT_UNSUPPORTED',
          category: 'recipient',
          message:
            'Notification Channel "in-app" does not support recipient type "email".',
        },
      }),
      expect.objectContaining({
        channel: 'email',
        status: 'accepted',
        recipientSnapshot: { address: 'alice@example.com' },
      }),
    ]);
    expect(
      (await manager.logs.get(partialResult.notificationId))?.log.status,
    ).toBe('partial');

    const failedResult = await manager.send({
      to: { type: 'phone', number: '123' },
      channels: ['in-app', 'email'],
      content: { body: 'Unsupported everywhere.' },
    });
    expect(failedResult.status).toBe('failed');
    expect(failedResult.deliveries).toEqual([
      expect.objectContaining({ channel: 'in-app', status: 'failed' }),
      expect.objectContaining({ channel: 'email', status: 'failed' }),
    ]);

    await manager.close();
    await queue.close();
    await database.destroy();
  });

  it('registers Channel and Provider definitions independently', async () => {
    const queue = createQueueManager(createSyncQueueConfig());
    const database = await createNotificationTestDatabase();
    const manager = createNotificationManager({
      database,
      queue,
      logger: createLogger({ level: 'silent' }),
      config: {
        channels: [
          {
            type: 'email',
            enabled: true,
            providers: [{ type: 'fake', name: 'primary' }],
          },
        ],
      },
      store: new FakeNotificationStore(),
    });

    manager
      .registerChannel({
        type: 'email',
        async createChannel() {
          return {
            type: 'email',
            async prepare(input): Promise<object> {
              return input.message;
            },
          };
        },
      })
      .registerProvider('email', {
        type: 'fake',
        async createProvider(_context, config) {
          return {
            name: config.name,
            type: config.type,
            async send() {
              return { status: 'accepted' } as const;
            },
          };
        },
      });

    await manager.start();

    expect(() =>
      manager.registerProvider('email', {
        type: 'late',
        async createProvider() {
          throw new Error('not created');
        },
      }),
    ).toThrow('must be registered before start()');

    await manager.close();
    await queue.close();
    await database.destroy();
  });

  it('rejects duplicate Provider definitions within one Channel', async () => {
    const queue = createQueueManager(createSyncQueueConfig());
    const database = await createNotificationTestDatabase();
    const manager = createNotificationManager({
      database,
      queue,
      logger: createLogger({ level: 'silent' }),
      config: { channels: [] },
      store: new FakeNotificationStore(),
    });
    const definition = {
      type: 'fake',
      async createProvider() {
        throw new Error('not created');
      },
    };

    manager.registerProvider('email', definition);

    expect(() => manager.registerProvider('email', definition)).toThrow(
      'already registered for Channel "email"',
    );

    await queue.close();
    await database.destroy();
  });

  it('rejects a Provider Runtime type that differs from its config', async () => {
    const queue = createQueueManager(createSyncQueueConfig());
    const database = await createNotificationTestDatabase();
    const manager = createNotificationManager({
      database,
      queue,
      logger: createLogger({ level: 'silent' }),
      config: {
        channels: [
          {
            type: 'email',
            enabled: true,
            providers: [{ type: 'configured', name: 'primary' }],
          },
        ],
      },
      store: new FakeNotificationStore(),
    });
    manager.registerChannel({
      type: 'email',
      async createChannel() {
        return {
          type: 'email',
          async prepare(input): Promise<object> {
            return input.message;
          },
        };
      },
    });
    manager.registerProvider('email', {
      type: 'configured',
      async createProvider(_context, config) {
        return {
          name: config.name,
          type: 'different',
          async send() {
            return { status: 'accepted' } as const;
          },
        };
      },
    });

    await expect(manager.start()).rejects.toThrow(
      'must match configured type "configured"',
    );
    await queue.close();
    await database.destroy();
  });

  it('can retry start after reconciliation fails without retaining Providers', async () => {
    const queue = createQueueManager(createSyncQueueConfig());
    const database = await createNotificationTestDatabase();
    const store = new FlakyReconcileStore();
    const close = vi.fn(async (): Promise<void> => undefined);
    const manager = createNotificationManager({
      database,
      queue,
      logger: createLogger({ level: 'silent' }),
      config: {
        channels: [
          {
            type: 'email',
            enabled: true,
            providers: [{ type: 'fake', name: 'primary' }],
          },
        ],
      },
      store,
    });
    manager
      .registerChannel({
        type: 'email',
        async createChannel() {
          return {
            type: 'email',
            async prepare(input): Promise<object> {
              return input.message;
            },
          };
        },
      })
      .registerProvider('email', {
        type: 'fake',
        async createProvider(_context, config) {
          return {
            name: config.name,
            type: config.type,
            async send() {
              return { status: 'accepted' } as const;
            },
            close,
          };
        },
      });

    await expect(manager.start()).rejects.toThrow('reconcile failed');
    expect(close).toHaveBeenCalledOnce();
    await expect(
      manager.send({ to: [], channels: [], content: { body: '' } }),
    ).rejects.toThrow('must complete before send');

    await manager.start();
    await manager.close();
    expect(close).toHaveBeenCalledTimes(2);

    await queue.close();
    await database.destroy();
  });
});

class FlakyReconcileStore extends FakeNotificationStore {
  private failNextList = true;

  override async listReady(
    now: string,
    limit?: number,
  ): Promise<readonly NotificationDeliveryRecord[]> {
    if (this.failNextList) {
      this.failNextList = false;
      throw new Error('reconcile failed');
    }
    return super.listReady(now, limit);
  }
}

type MemoryDestination = DestinationStream & {
  records(): Array<Record<string, unknown>>;
};

function createMemoryDestination(): MemoryDestination {
  const lines: string[] = [];
  return {
    write(message: string): void {
      lines.push(message);
    },
    records(): Array<Record<string, unknown>> {
      return lines
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
  };
}
