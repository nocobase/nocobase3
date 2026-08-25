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

    const middleware = vi.fn();
    manager.router.use('*', async (_context, next): Promise<void> => {
      middleware();
      await next();
    });
    await manager.start();
    const result = await manager.send({
      source: { type: 'test' },
      recipients: [
        {
          channels: [
            {
              channel: 'email',
              recipient: { address: 'private@example.com' },
            },
          ],
        },
      ],
      message: { email: { subject: 'private subject' } },
    });
    const details = await manager.logs.get(result.notificationId);
    expect(details?.log).not.toHaveProperty('messageSnapshot');
    expect(details?.deliveries[0]?.delivery).not.toHaveProperty(
      'recipientSnapshot',
    );
    expect(details?.deliveries[0]?.delivery).not.toHaveProperty(
      'messageSnapshot',
    );
    expect(details?.deliveries[0]?.delivery).not.toHaveProperty('recipientKey');
    const logResponse = await manager.router.request(
      `/logs/${result.notificationId}`,
    );
    expect(logResponse.status).toBe(200);
    expect(await logResponse.json()).toEqual({ data: details });
    expect(middleware).toHaveBeenCalledOnce();
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

    expect(manager.channelManager.has('email')).toBe(true);
    expect(manager.channelManager.providerNames('email')).toEqual(['primary']);
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

  it('returns the existing notification for the same idempotency key', async () => {
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
    const input = {
      idempotencyKey: 'approval-42',
      recipients: [
        {
          channels: [
            {
              channel: 'email' as const,
              recipient: { address: 'test@example.com' },
            },
          ],
        },
      ],
      message: { email: { subject: 'Approved' } },
    };

    const first = await manager.send(input);
    const second = await manager.send(input);
    expect(second.notificationId).toBe(first.notificationId);
    expect(second.deliveries.map((item) => item.id)).toEqual(
      first.deliveries.map((item) => item.id),
    );

    await manager.close();
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
    await expect(manager.send({ recipients: [], message: {} })).rejects.toThrow(
      'must complete before send',
    );

    await manager.start();
    expect(manager.channelManager.has('email')).toBe(true);
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
