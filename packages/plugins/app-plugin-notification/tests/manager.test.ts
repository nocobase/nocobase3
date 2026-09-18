import { createLogger, type DestinationStream } from '@nocobase/logging';
import { randomUUID } from 'node:crypto';
import { createQueueService } from '@nocobase/queue';
import type { DatabaseManager } from '@nocobase/db';
import { describe, expect, it, vi } from 'vitest';

import { createNotificationManager } from '../server/manager.js';
import {
  createDatabaseNotificationStore,
  type NotificationAttemptRecord,
  type NotificationDeliveryRecord,
  type NotificationStore,
} from '../server/store.js';
import {
  NOTIFICATION_DELIVERY_CHANNEL,
  NOTIFICATION_QUEUE_NAME,
} from '../server/delivery-job.js';
import type {
  NotificationProviderCapabilities,
  NotificationStatusSnapshot,
  NotificationProviderSendInput,
  ProviderSendResult,
} from '../server/types.js';
import { createNotificationTestDatabase } from './helpers/database.js';
import { FakeNotificationStore } from './helpers/fake-notification-store.js';

describe('NotificationManager registration', () => {
  it('does not activate persistence or queue resources without enabled Channels', async () => {
    const queue = createQueueService({
      namespace: `notification-test-${randomUUID()}`,
    });
    await queue.setup();
    const store = new FakeNotificationStore();
    const listReady = vi.spyOn(store, 'listReady');
    const manager = createNotificationManager({
      database: {} as DatabaseManager,
      queue,
      logger: createLogger({ level: 'silent' }),
      config: { channels: [] },
      store,
    });

    await manager.start();

    expect(listReady).not.toHaveBeenCalled();
    await manager.close();
    await queue.shutdown();
  });

  it('closes Providers when a later Provider fails during startup', async () => {
    const queue = createQueueService({
      namespace: `notification-test-${randomUUID()}`,
    });
    await queue.setup();
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
    manager.registry.registerChannel({
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
    manager.registry.registerProvider('email', {
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
    manager.registry.registerProvider('email', {
      type: 'broken',
      async createProvider() {
        throw new Error('startup failed');
      },
    });

    await expect(manager.start()).rejects.toThrow('startup failed');
    expect(close).toHaveBeenCalledOnce();

    await queue.shutdown();
    await database.destroy();
  });

  it('emits structured lifecycle logs without notification content', async () => {
    const output = createMemoryDestination();
    const resolvedProviders: object[] = [];
    const queue = createQueueService({
      namespace: `notification-test-${randomUUID()}`,
    });
    await queue.setup();
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
            providers: [
              { type: 'fake', name: 'secondary' },
              { type: 'fake', name: 'primary' },
            ],
          },
        ],
      },
      store: new FakeNotificationStore(),
    });

    manager.registry
      .registerChannel({
        type: 'email',
        async createChannel() {
          return {
            type: 'email',
            resolveRecipient({ recipient, provider }): object {
              resolvedProviders.push(provider);
              return recipient ?? {};
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
      idempotencyKey: 'manager-structured-logs',
      source: { type: 'test' },
      to: { type: 'email', address: 'private@example.com' },
      channels: ['email'],
      content: { title: 'private subject', body: 'private body' },
    });
    await waitForTerminalNotification(manager, result.notificationId);
    const details = await manager.logs.get(result.notificationId);
    expect(resolvedProviders).toEqual([{ name: 'secondary', type: 'fake' }]);
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
          providerCount: 2,
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
          provider: 'secondary',
        }),
        expect.objectContaining({
          event: 'notification.manager.closed',
        }),
      ]),
    );
    expect(JSON.stringify(records)).not.toContain('private@example.com');
    expect(JSON.stringify(records)).not.toContain('private subject');

    await queue.shutdown();
    await database.destroy();
  });

  it('selects a non-primary Provider by name with the default single strategy', async () => {
    const queue = createQueueService({
      namespace: `notification-test-${randomUUID()}`,
    });
    await queue.setup();
    const database = await createNotificationTestDatabase();
    const store = new FakeNotificationStore();
    const manager = createNotificationManager({
      database,
      queue,
      logger: createLogger({ level: 'silent' }),
      config: {
        channels: [
          {
            type: 'im',
            enabled: true,
            providers: [
              { type: 'fake', name: 'primary' },
              { type: 'fake', name: 'secondary' },
            ],
          },
        ],
      },
      store,
    });
    manager.registry
      .registerChannel({
        type: 'im',
        async createChannel() {
          return {
            type: 'im',
            resolveRecipient({ recipient, provider }): object | undefined {
              return !recipient ? { providerName: provider.name } : undefined;
            },
            render({ content }): object {
              return { text: content.body };
            },
            async prepare(input): Promise<object> {
              return input.message;
            },
          };
        },
      })
      .registerProvider('im', {
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

    const result = await manager.send({
      idempotencyKey: 'manager-select-provider',
      channels: ['im'],
      routing: {
        im: {
          providers: {
            provider: 'secondary',
          },
        },
      },
      content: { body: 'Review it.' },
    });
    await expect
      .poll(() => store.listDeliveries(result.notificationId))
      .toEqual([
        expect.objectContaining({
          providerName: 'secondary',
          status: 'accepted',
          recipientSnapshot: { providerName: 'secondary' },
        }),
      ]);

    await manager.close();
    await queue.shutdown();
    await database.destroy();
  });

  it('routes to all enabled Providers as independent Deliveries', async () => {
    const queue = createQueueService({
      namespace: `notification-test-${randomUUID()}`,
    });
    await queue.setup();
    const database = await createNotificationTestDatabase();
    const store = new FakeNotificationStore();
    const send = vi.fn(async () => ({ status: 'accepted' }) as const);
    const manager = createNotificationManager({
      database,
      queue,
      logger: createLogger({ level: 'silent' }),
      config: {
        channels: [
          {
            type: 'im',
            enabled: true,
            providers: [
              { type: 'feishu-webhook', name: 'feishu' },
              { type: 'dingtalk-webhook', name: 'dingtalk' },
            ],
          },
        ],
      },
      store,
    });
    manager.registry.registerChannel({
      type: 'im',
      async createChannel() {
        return {
          type: 'im',
          resolveRecipient({ recipient, provider }): object | undefined {
            return !recipient ? { provider } : undefined;
          },
          render({ content }): object {
            return { text: content.body };
          },
          async prepare(input): Promise<object> {
            return input.message;
          },
        };
      },
    });
    for (const providerType of ['feishu-webhook', 'dingtalk-webhook']) {
      manager.registry.registerProvider('im', {
        type: providerType,
        async createProvider(_context, config) {
          return { name: config.name, type: config.type, send };
        },
      });
    }

    const result = await manager.send({
      idempotencyKey: 'manager-all-providers',
      channels: ['im'],
      routing: { im: { providers: { strategy: 'all' } } },
      content: { body: 'Send it everywhere.' },
    });
    await waitForTerminalNotification(manager, result.notificationId);
    const deliveries = await store.listDeliveries(result.notificationId);

    expect(deliveries).toEqual([
      expect.objectContaining({
        providerName: 'feishu',
        providerType: 'feishu-webhook',
        recipientSnapshot: {
          provider: { name: 'feishu', type: 'feishu-webhook' },
        },
        status: 'accepted',
      }),
      expect.objectContaining({
        providerName: 'dingtalk',
        providerType: 'dingtalk-webhook',
        recipientSnapshot: {
          provider: { name: 'dingtalk', type: 'dingtalk-webhook' },
        },
        status: 'accepted',
      }),
    ]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.deliveries).toEqual([
      expect.objectContaining({
        channel: 'im',
        provider: { name: 'feishu', type: 'feishu-webhook' },
      }),
      expect.objectContaining({
        channel: 'im',
        provider: { name: 'dingtalk', type: 'dingtalk-webhook' },
      }),
    ]);

    const selectedResult = await manager.send({
      idempotencyKey: 'manager-selected-all-provider',
      channels: ['im'],
      routing: {
        im: {
          providers: {
            strategy: 'all',
            providers: ['dingtalk'],
          },
        },
      },
      content: { body: 'Send it to the selected Provider.' },
    });
    await expect
      .poll(() => store.listDeliveries(selectedResult.notificationId))
      .toEqual([
        expect.objectContaining({
          providerName: 'dingtalk',
          providerType: 'dingtalk-webhook',
          status: 'accepted',
        }),
      ]);
    expect(send).toHaveBeenCalledTimes(3);

    await manager.close();
    await queue.shutdown();
    await database.destroy();
  });

  it('rejects an explicitly routed Provider that is not enabled', async () => {
    const queue = createQueueService({
      namespace: `notification-test-${randomUUID()}`,
    });
    await queue.setup();
    const database = await createNotificationTestDatabase();
    const manager = createNotificationManager({
      database,
      queue,
      logger: createLogger({ level: 'silent' }),
      config: {
        channels: [
          {
            type: 'im',
            enabled: true,
            providers: [{ type: 'fake', name: 'primary' }],
          },
        ],
      },
      store: new FakeNotificationStore(),
    });
    manager.registry
      .registerChannel({
        type: 'im',
        async createChannel() {
          return {
            type: 'im',
            render({ content }): object {
              return { text: content.body };
            },
            async prepare(input): Promise<object> {
              return input.message;
            },
          };
        },
      })
      .registerProvider('im', {
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

    await expect(
      manager.send({
        idempotencyKey: 'manager-missing-provider',
        routing: {
          im: {
            providers: {
              strategy: 'single',
              provider: 'missing',
            },
          },
        },
        channels: ['im'],
        content: { body: 'Do not fall back.' },
      }),
    ).rejects.toThrow(
      'Notification Provider "missing" is not enabled for Channel "im".',
    );

    await manager.close();
    await queue.shutdown();
    await database.destroy();
  });

  it('expands shared content across recipients and Channels', async () => {
    const queue = createQueueService({
      namespace: `notification-test-${randomUUID()}`,
    });
    await queue.setup();
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
      manager.registry
        .registerChannel({
          type: channelType,
          async createChannel() {
            return {
              type: channelType,
              async resolveRecipient({
                recipient,
              }): Promise<object | undefined> {
                if (recipient?.type === 'user') return { userId: recipient.id };
                if (channelType === 'email' && recipient?.type === 'email')
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
    const result = await manager.send({
      idempotencyKey: 'manager-expand-content',
      to: [
        { type: 'user', id: 'user-1' },
        { type: 'user', id: 'user-2' },
      ],
      channels: ['in-app', 'email'],
      content: { title: 'Approval complete', body: 'Review the result.' },
      channelOverrides: { email: { title: 'Email subject' } },
    });
    await waitForTerminalNotification(manager, result.notificationId);
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
      idempotencyKey: 'manager-partial',
      to: { type: 'email', address: 'alice@example.com' },
      channels: ['in-app', 'email'],
      content: { body: 'Mixed recipient support.' },
    });
    await waitForTerminalNotification(manager, partialResult.notificationId);
    const partialDeliveries = await store.listDeliveries(
      partialResult.notificationId,
    );
    expect(
      (await manager.getNotification(partialResult.notificationId))?.status,
    ).toBe('partial');
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

    const missingRecipientResult = await manager.send({
      idempotencyKey: 'manager-missing-recipient',
      channels: ['email'],
      content: { body: 'Recipient is required by this Channel.' },
    });
    expect(missingRecipientResult.status).toBe('failed');
    expect(missingRecipientResult.deliveries).toEqual([
      expect.objectContaining({
        channel: 'email',
        status: 'failed',
        error: {
          code: 'RECIPIENT_UNSUPPORTED',
          category: 'recipient',
          message: 'Notification Channel "email" requires a recipient.',
        },
      }),
    ]);
    await expect(
      store.listDeliveries(missingRecipientResult.notificationId),
    ).resolves.toEqual([
      expect.objectContaining({
        channel: 'email',
        recipientSnapshot: {},
        lastError: {
          code: 'RECIPIENT_UNSUPPORTED',
          category: 'recipient',
          message: 'Notification Channel "email" requires a recipient.',
        },
      }),
    ]);

    const failedResult = await manager.send({
      idempotencyKey: 'manager-failed',
      to: { type: 'phone', number: '123' },
      channels: ['in-app', 'email'],
      content: { body: 'Unsupported everywhere.' },
    });
    expect(failedResult.status).toBe('failed');
    expect(failedResult.deliveries).toEqual([
      expect.objectContaining({
        channel: 'in-app',
        status: 'failed',
        retry: {
          allowed: false,
          mode: 'not_allowed',
          reason: expect.any(String),
        },
      }),
      expect.objectContaining({
        channel: 'email',
        status: 'failed',
        retry: {
          allowed: false,
          mode: 'not_allowed',
          reason: expect.any(String),
        },
      }),
    ]);

    await manager.close();
    await queue.shutdown();
    await database.destroy();
  });

  it('registers Channel and Provider definitions independently', async () => {
    const queue = createQueueService({
      namespace: `notification-test-${randomUUID()}`,
    });
    await queue.setup();
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

    manager.registry
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
      manager.registry.registerProvider('email', {
        type: 'late',
        async createProvider() {
          throw new Error('not created');
        },
      }),
    ).not.toThrow();

    await manager.close();
    await queue.shutdown();
    await database.destroy();
  });

  it('rejects duplicate Provider definitions within one Channel', async () => {
    const queue = createQueueService({
      namespace: `notification-test-${randomUUID()}`,
    });
    await queue.setup();
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

    manager.registry.registerProvider('email', definition);

    expect(() =>
      manager.registry.registerProvider('email', definition),
    ).toThrow('already registered for Channel "email"');

    await queue.shutdown();
    await database.destroy();
  });

  it('rejects a Provider Runtime type that differs from its config', async () => {
    const queue = createQueueService({
      namespace: `notification-test-${randomUUID()}`,
    });
    await queue.setup();
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
    manager.registry.registerChannel({
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
    manager.registry.registerProvider('email', {
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
    await queue.shutdown();
    await database.destroy();
  });

  it('can retry start after reconciliation fails without retaining Providers', async () => {
    const queue = createQueueService({
      namespace: `notification-test-${randomUUID()}`,
    });
    await queue.setup();
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
    manager.registry
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
      manager.send({
        idempotencyKey: 'manager-invalid',
        to: [],
        channels: [],
        content: { body: '' },
      }),
    ).rejects.toThrow('At least one notification recipient is required.');

    await manager.start();
    await manager.close();
    expect(close).toHaveBeenCalledTimes(2);

    await queue.shutdown();
    await database.destroy();
  });

  it('reconciles a failed queue publication and ignores a queued redelivery of the accepted Delivery', async () => {
    const database = await createNotificationTestDatabase();
    const store = createDatabaseNotificationStore(database);
    const send = vi.fn(async () => ({ status: 'accepted' }) as const);
    // Control only intervals: the real memory Worker and polling keep real timers.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { manager, queue } = await createEmailManagerHarness({
      database,
      store,
      send,
      reconcileIntervalMs: 1_000,
    });
    const producer = queue.producer(NOTIFICATION_QUEUE_NAME);
    const publicationError = new Error('First notification publication failed');
    const publish = vi
      .spyOn(producer, 'publish')
      .mockRejectedValueOnce(publicationError);
    const listReady = vi.spyOn(store, 'listReady');

    try {
      await manager.start();
      expect(listReady).toHaveBeenCalledOnce();
      listReady.mockClear();
      const result = await manager.send({
        idempotencyKey: 'notification-enqueue-recovery',
        to: { type: 'email', address: 'buyer@example.com' },
        channels: ['email'],
        content: { body: 'Recover this persisted delivery.' },
      });
      expect(result.deliveries).toHaveLength(1);
      const deliveryId = result.deliveries[0]!.id;
      expect(publish).toHaveBeenCalledExactlyOnceWith(
        NOTIFICATION_DELIVERY_CHANNEL,
        { deliveryId },
      );
      await expect(publish.mock.results[0]!.value).rejects.toBe(
        publicationError,
      );
      expect(listReady).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();

      // Read through a fresh production store, not the send result or a mock cache.
      const persisted = createDatabaseNotificationStore(database);
      await expect(
        persisted.getLogByIdempotencyKey(result.idempotencyKey),
      ).resolves.toMatchObject({
        id: result.notificationId,
        status: 'pending',
      });
      await expect(persisted.getDelivery(deliveryId)).resolves.toMatchObject({
        id: deliveryId,
        notificationId: result.notificationId,
        status: 'pending',
        attemptCount: 0,
      });
      await expect(persisted.listAttempts(deliveryId)).resolves.toEqual([]);

      // Run the manager-owned periodic reconciler, without another send or retry.
      await vi.advanceTimersByTimeAsync(1_000);
      await expect
        .poll(() => manager.getNotification(result.notificationId))
        .toMatchObject({
          status: 'completed',
          terminal: true,
          summary: { total: 1, accepted: 1, pending: 0 },
        });
      expect(listReady).toHaveBeenCalledOnce();
      await expect(listReady.mock.results[0]!.value).resolves.toMatchObject([
        { id: deliveryId, status: 'pending' },
      ]);
      expect(publish).toHaveBeenCalledTimes(2);
      expect(publish).toHaveBeenNthCalledWith(
        2,
        NOTIFICATION_DELIVERY_CHANNEL,
        { deliveryId },
      );
      const recoveredReceipt = await publish.mock.results[1]!.value;
      const accepted = await persisted.getDelivery(deliveryId);
      expect(accepted).toMatchObject({ status: 'accepted', attemptCount: 1 });
      const attempts = await persisted.listAttempts(deliveryId);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({ sequence: 1, status: 'accepted' });
      expect(send).toHaveBeenCalledOnce();

      // A new queue job with the same business ID must reach the production handler.
      const deliveryRead = vi.spyOn(store, 'getDelivery');
      const duplicateReceipt = await producer.publish(
        NOTIFICATION_DELIVERY_CHANNEL,
        { deliveryId },
      );
      expect(duplicateReceipt.jobId).not.toBe(recoveredReceipt.jobId);
      await expect.poll(() => deliveryRead.mock.calls).toEqual([[deliveryId]]);
      // Unregistration awaits in-flight handler settlement, not just queue receipt.
      await manager.close();
      expect(send).toHaveBeenCalledOnce();
      await expect(persisted.getDelivery(deliveryId)).resolves.toEqual(
        accepted,
      );
      await expect(persisted.listAttempts(deliveryId)).resolves.toEqual(
        attempts,
      );
      await expect(
        persisted.getLog(result.notificationId),
      ).resolves.toMatchObject({ status: 'completed' });
    } finally {
      try {
        await manager.close();
      } finally {
        try {
          await queue.shutdown();
        } finally {
          await database.destroy();
          vi.useRealTimers();
          vi.restoreAllMocks();
        }
      }
    }
  });

  it('deduplicates repeated sends and rejects reuse with different content', async () => {
    const send = vi.fn(async () => ({ status: 'accepted' }) as const);
    const { manager, queue } = await createEmailManagerHarness({ send });
    const input = {
      idempotencyKey: 'order-won:42:user-7:email',
      to: { type: 'email', address: 'buyer@example.com' } as const,
      channels: ['email'] as const,
      content: { title: 'Order won', body: 'Order 42 was won.' },
    };

    const first = await manager.send(input);
    await waitForTerminalNotification(manager, first.notificationId);
    const repeated = await manager.send(input);

    expect(first.deduplicated).toBe(false);
    expect(repeated).toMatchObject({
      notificationId: first.notificationId,
      idempotencyKey: input.idempotencyKey,
      deduplicated: true,
      status: 'completed',
    });
    expect(send).toHaveBeenCalledOnce();
    await expect(
      manager.getByIdempotencyKey(input.idempotencyKey),
    ).resolves.toMatchObject({
      notificationId: first.notificationId,
      terminal: true,
      summary: { accepted: 1 },
    });
    await expect(
      manager.send({
        ...input,
        content: { title: 'Order won', body: 'Different body.' },
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });

    await manager.close();
    await queue.shutdown();
  });

  it('derives a self-consistent status snapshot from one Delivery read', async () => {
    const store = new StaleLogStatusNotificationStore();
    const { manager, queue } = await createEmailManagerHarness({
      store,
      send: async () => ({ status: 'accepted' }),
    });

    const sent = await manager.send({
      idempotencyKey: 'consistent-status-snapshot-1',
      to: { type: 'email', address: 'buyer@example.com' },
      channels: ['email'],
      content: { body: 'Consistent status.' },
    });

    await expect
      .poll(() => manager.getNotification(sent.notificationId))
      .toMatchObject({
        status: 'completed',
        terminal: true,
        summary: { accepted: 1, pending: 0 },
        deliveries: [{ status: 'accepted' }],
      });

    await manager.close();
    await queue.shutdown();
  });

  it('emits process-local status events without awaiting listener work', async () => {
    const { manager, queue } = await createEmailManagerHarness({
      send: async () => ({ status: 'accepted' }),
    });
    const listener = vi.fn(async () => new Promise<void>(() => undefined));
    const unsubscribe = manager.onStatusChanged(
      { idempotencyKey: 'status-event-1' },
      listener,
    );

    const result = await manager.send({
      idempotencyKey: 'status-event-1',
      to: { type: 'email', address: 'buyer@example.com' },
      channels: ['email'],
      content: { body: 'Status event.' },
    });
    await vi.waitFor(() =>
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed', terminal: true }),
      ),
    );

    expect((await manager.getNotification(result.notificationId))?.status).toBe(
      'completed',
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'status-event-1',
        notificationId: result.notificationId,
      }),
    );
    unsubscribe();
    await manager.close();
    await queue.shutdown();
  });

  it('does not emit an older status snapshot after a newer one', async () => {
    const store = new DelayedLogNotificationStore();
    const send = vi
      .fn<
        (input: NotificationProviderSendInput) => Promise<ProviderSendResult>
      >()
      .mockResolvedValueOnce({
        status: 'failed',
        disposition: 'never',
        error: { message: 'rejected', category: 'provider' },
      })
      .mockResolvedValueOnce({ status: 'accepted' });
    const { manager, queue } = await createEmailManagerHarness({ send, store });
    const sent = await manager.send({
      idempotencyKey: 'status-event-order-1',
      to: { type: 'email', address: 'buyer@example.com' },
      channels: ['email'],
      content: { body: 'Ordered status event.' },
    });
    await expect
      .poll(() => manager.getNotification(sent.notificationId))
      .toMatchObject({ status: 'failed', terminal: true });
    const gate = store.delayNextLogRead();
    const statuses: string[] = [];
    const unsubscribe = manager.onStatusChanged(
      { notificationId: sent.notificationId },
      (event) => {
        statuses.push(event.status);
      },
    );
    await gate.captured;

    await manager.retryDelivery({
      deliveryId: sent.deliveries[0]!.id,
      reason: 'Retry after correcting the terminal failure.',
    });
    await vi.waitFor(() => expect(statuses).toContain('completed'));
    gate.release();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(statuses.at(-1)).toBe('completed');
    unsubscribe();
    await manager.close();
    await queue.shutdown();
  });

  it('retries terminal failed Deliveries and records the retry resolution', async () => {
    const send = vi
      .fn<
        (input: NotificationProviderSendInput) => Promise<ProviderSendResult>
      >()
      .mockResolvedValueOnce({
        status: 'failed',
        disposition: 'never',
        error: { message: 'rejected', category: 'provider' },
      })
      .mockResolvedValueOnce({ status: 'accepted' });
    const { manager, queue, store } = await createEmailManagerHarness({ send });
    const sent = await manager.send({
      idempotencyKey: 'retry-failed-1',
      to: { type: 'email', address: 'buyer@example.com' },
      channels: ['email'],
      content: { body: 'Retry failure.' },
    });

    expect(
      (await waitForTerminalNotification(manager, sent.notificationId))
        .deliveries[0],
    ).toMatchObject({
      status: 'failed',
      retry: { allowed: true, mode: 'safe' },
    });
    await expect(
      manager.retryDelivery({
        deliveryId: sent.deliveries[0]!.id,
        reason: '   ',
      }),
    ).rejects.toMatchObject({
      code: 'NOTIFICATION_DELIVERY_RETRY_NOT_ALLOWED',
      message: expect.stringContaining('reason'),
    });
    await manager.retryDelivery({
      deliveryId: sent.deliveries[0]!.id,
      reason: 'Retry after correcting the terminal failure.',
    });
    await expect
      .poll(() => manager.store.getDelivery(sent.deliveries[0]!.id))
      .toMatchObject({ status: 'accepted', attemptCount: 2 });
    await expect(
      store.listAttempts(sent.deliveries[0]!.id),
    ).resolves.toMatchObject([
      { sequence: 1, retryResolution: undefined },
      {
        sequence: 2,
        retryResolution: { type: 'terminal_failure' },
      },
    ]);

    await manager.close();
    await queue.shutdown();
  });

  it('requires a reason before retrying an unsafe unknown Delivery', async () => {
    const send = vi
      .fn<
        (input: NotificationProviderSendInput) => Promise<ProviderSendResult>
      >()
      .mockResolvedValueOnce({
        status: 'submission_unknown',
        error: { message: 'connection lost', category: 'network' },
      })
      .mockResolvedValueOnce({ status: 'accepted' });
    const { manager, queue, store } = await createEmailManagerHarness({ send });
    const sent = await manager.send({
      idempotencyKey: 'retry-unknown-unsafe-1',
      to: { type: 'email', address: 'buyer@example.com' },
      channels: ['email'],
      content: { body: 'Unknown result.' },
    });
    const deliveryId = sent.deliveries[0]!.id;

    expect(
      (await waitForTerminalNotification(manager, sent.notificationId))
        .deliveries[0],
    ).toMatchObject({
      status: 'unknown',
      retry: {
        allowed: true,
        mode: 'duplicate_risk_confirmation_required',
      },
    });
    await expect(
      manager.retryDelivery({ deliveryId, reason: '   ' }),
    ).rejects.toMatchObject({
      code: 'NOTIFICATION_DELIVERY_RETRY_NOT_ALLOWED',
    });
    await manager.retryDelivery({
      deliveryId,
      reason: 'The business owner prefers a possible duplicate to an omission.',
    });
    await expect
      .poll(() => manager.store.getDelivery(deliveryId))
      .toMatchObject({ status: 'accepted', attemptCount: 2 });
    await expect(store.listAttempts(deliveryId)).resolves.toMatchObject([
      { sequence: 1 },
      {
        sequence: 2,
        retryResolution: { type: 'duplicate_risk_accepted' },
      },
    ]);

    await manager.close();
    await queue.shutdown();
  });

  it('safely retries an unknown Delivery when the Provider reuses deliveryId', async () => {
    const send = vi
      .fn<
        (input: NotificationProviderSendInput) => Promise<ProviderSendResult>
      >()
      .mockResolvedValueOnce({
        status: 'submission_unknown',
        error: { message: 'response lost', category: 'network' },
      })
      .mockResolvedValueOnce({ status: 'accepted' });
    const capabilities = {
      idempotency: { supported: true },
    } as const satisfies NotificationProviderCapabilities;
    const { manager, queue } = await createEmailManagerHarness({
      send,
      capabilities,
    });
    const sent = await manager.send({
      idempotencyKey: 'retry-unknown-safe-1',
      to: { type: 'email', address: 'buyer@example.com' },
      channels: ['email'],
      content: { body: 'Unknown result with Provider idempotency.' },
    });
    const deliveryId = sent.deliveries[0]!.id;

    expect(
      (await waitForTerminalNotification(manager, sent.notificationId))
        .deliveries[0]?.retry,
    ).toMatchObject({
      allowed: true,
      mode: 'safe',
    });
    await manager.retryDelivery({
      deliveryId,
      reason: 'Retry within the Provider idempotency window.',
    });
    await expect
      .poll(() => manager.store.getDelivery(deliveryId))
      .toMatchObject({ status: 'accepted' });
    expect(send.mock.calls.map(([input]) => input.deliveryId)).toEqual([
      deliveryId,
      deliveryId,
    ]);

    await manager.close();
    await queue.shutdown();
  });

  it('does not extend a bounded Provider idempotency window on each retry', async () => {
    const store = new ControlledNowNotificationStore(
      '2026-09-01T00:00:00.000Z',
    );
    const send = vi
      .fn<
        (input: NotificationProviderSendInput) => Promise<ProviderSendResult>
      >()
      .mockResolvedValue({
        status: 'submission_unknown',
        error: { message: 'response lost', category: 'network' },
      });
    const { manager, queue } = await createEmailManagerHarness({
      send,
      store,
      capabilities: {
        idempotency: {
          supported: true,
          retentionMs: 24 * 60 * 60 * 1_000,
        },
      },
    });
    const sent = await manager.send({
      idempotencyKey: 'retry-unknown-bounded-window-1',
      to: { type: 'email', address: 'buyer@example.com' },
      channels: ['email'],
      content: { body: 'Bounded Provider idempotency.' },
    });
    const deliveryId = sent.deliveries[0]!.id;

    await waitForTerminalNotification(manager, sent.notificationId);
    store.setNow('2026-09-01T23:00:00.000Z');
    await manager.retryDelivery({
      deliveryId,
      reason: 'Retry within the Provider idempotency window.',
    });
    await expect
      .poll(() => manager.store.getDelivery(deliveryId))
      .toMatchObject({ status: 'unknown', attemptCount: 2 });
    store.setNow('2026-09-02T01:00:00.000Z');

    await expect(
      manager.getNotification(sent.notificationId),
    ).resolves.toMatchObject({
      deliveries: [
        {
          retry: {
            allowed: true,
            mode: 'duplicate_risk_confirmation_required',
          },
        },
      ],
    });
    expect(send).toHaveBeenCalledTimes(2);

    await manager.close();
    await queue.shutdown();
  });

  it('submits an accepted-risk retry when its Provider idempotency window expires during preparation', async () => {
    const store = new ControlledNowNotificationStore(
      '2026-09-01T00:00:00.000Z',
    );
    const send = vi
      .fn<
        (input: NotificationProviderSendInput) => Promise<ProviderSendResult>
      >()
      .mockResolvedValueOnce({
        status: 'submission_unknown',
        error: { message: 'response lost', category: 'network' },
      })
      .mockResolvedValueOnce({ status: 'accepted' });
    let prepareCount = 0;
    const { manager, queue } = await createEmailManagerHarness({
      send,
      store,
      prepare(message) {
        prepareCount += 1;
        if (prepareCount === 2) store.setNow('2026-09-01T00:00:01.100Z');
        return message;
      },
      capabilities: {
        idempotency: {
          supported: true,
          retentionMs: 1_000,
        },
      },
    });
    const sent = await manager.send({
      idempotencyKey: 'retry-unknown-expired-during-preparation-1',
      to: { type: 'email', address: 'buyer@example.com' },
      channels: ['email'],
      content: { body: 'Slow preparation.' },
    });
    const deliveryId = sent.deliveries[0]!.id;
    await waitForTerminalNotification(manager, sent.notificationId);
    store.setNow('2026-09-01T00:00:00.900Z');

    await manager.retryDelivery({
      deliveryId,
      reason: 'Retry while the Provider idempotency window is active.',
    });
    await expect
      .poll(() => manager.store.getDelivery(deliveryId))
      .toMatchObject({
        status: 'accepted',
        attemptCount: 2,
      });
    expect(send).toHaveBeenCalledTimes(2);
    await expect(store.listAttempts(deliveryId)).resolves.toMatchObject([
      { sequence: 1, retryResolution: undefined },
      {
        sequence: 2,
        retryResolution: { type: 'duplicate_risk_accepted' },
      },
    ]);
    await expect(store.listRetryAudits(deliveryId)).resolves.toMatchObject([
      {
        resolution: { type: 'safe_provider_idempotency' },
        providerIdempotency: {
          startedAt: '2026-09-01T00:00:00.000Z',
          expiresAt: '2026-09-01T00:00:01.000Z',
        },
      },
    ]);

    await manager.close();
    await queue.shutdown();
  });

  it('rechecks Provider idempotency after persisting the retry Attempt', async () => {
    const store = new ExpiringStartAttemptNotificationStore(
      '2026-09-01T00:00:00.000Z',
      '2026-09-01T00:00:01.100Z',
    );
    const send = vi
      .fn<
        (input: NotificationProviderSendInput) => Promise<ProviderSendResult>
      >()
      .mockResolvedValueOnce({
        status: 'submission_unknown',
        error: { message: 'response lost', category: 'network' },
      })
      .mockResolvedValueOnce({ status: 'accepted' });
    const { manager, queue } = await createEmailManagerHarness({
      send,
      store,
      capabilities: {
        idempotency: {
          supported: true,
          retentionMs: 1_000,
        },
      },
    });
    const sent = await manager.send({
      idempotencyKey: 'retry-unknown-expired-during-attempt-start-1',
      to: { type: 'email', address: 'buyer@example.com' },
      channels: ['email'],
      content: { body: 'Slow persistence.' },
    });
    const deliveryId = sent.deliveries[0]!.id;
    await waitForTerminalNotification(manager, sent.notificationId);
    store.setNow('2026-09-01T00:00:00.900Z');

    await manager.retryDelivery({
      deliveryId,
      reason: 'Retry while the Provider idempotency window is active.',
    });
    await expect
      .poll(() => manager.store.getDelivery(deliveryId))
      .toMatchObject({ status: 'accepted', attemptCount: 2 });
    expect(send).toHaveBeenCalledTimes(2);
    await expect(store.listAttempts(deliveryId)).resolves.toMatchObject([
      { sequence: 1, retryResolution: undefined },
      {
        sequence: 2,
        retryResolution: { type: 'duplicate_risk_accepted' },
      },
    ]);
    await expect(store.listRetryAudits(deliveryId)).resolves.toMatchObject([
      { resolution: { type: 'safe_provider_idempotency' } },
    ]);

    await manager.close();
    await queue.shutdown();
  });

  it('does not infer idempotency for an old unknown attempt from new Provider capabilities', async () => {
    const store = new FakeNotificationStore();
    const firstSend = vi.fn(async (): Promise<ProviderSendResult> => ({
      status: 'submission_unknown',
      error: { message: 'response lost', category: 'network' },
    }));
    const first = await createEmailManagerHarness({ send: firstSend, store });
    const sent = await first.manager.send({
      idempotencyKey: 'retry-unknown-capability-upgrade-1',
      to: { type: 'email', address: 'buyer@example.com' },
      channels: ['email'],
      content: { body: 'Capability changes after submission.' },
    });
    await expect
      .poll(() => first.manager.getNotification(sent.notificationId))
      .toMatchObject({ status: 'unknown', terminal: true });
    await first.manager.close();
    await first.queue.shutdown();

    const upgradedSend = vi.fn(async (): Promise<ProviderSendResult> => ({
      status: 'accepted',
    }));
    const upgraded = await createEmailManagerHarness({
      send: upgradedSend,
      store,
      capabilities: {
        idempotency: { supported: true },
      },
    });

    await expect(
      upgraded.manager.getNotification(sent.notificationId),
    ).resolves.toMatchObject({
      deliveries: [
        {
          retry: {
            allowed: true,
            mode: 'duplicate_risk_confirmation_required',
          },
        },
      ],
    });
    expect(upgradedSend).not.toHaveBeenCalled();

    await upgraded.manager.close();
    await upgraded.queue.shutdown();
  });

  it('does not use persisted idempotency evidence after the Provider drops that capability', async () => {
    const store = new FakeNotificationStore();
    const first = await createEmailManagerHarness({
      store,
      send: async () => ({
        status: 'submission_unknown',
        error: { message: 'response lost', category: 'network' },
      }),
      capabilities: {
        idempotency: { supported: true },
      },
    });
    const sent = await first.manager.send({
      idempotencyKey: 'retry-unknown-capability-removed-1',
      to: { type: 'email', address: 'buyer@example.com' },
      channels: ['email'],
      content: { body: 'Capability removed after submission.' },
    });
    await expect
      .poll(() => first.manager.getNotification(sent.notificationId))
      .toMatchObject({ status: 'unknown', terminal: true });
    await first.manager.close();
    await first.queue.shutdown();

    const currentSend = vi.fn(async (): Promise<ProviderSendResult> => ({
      status: 'accepted',
    }));
    const current = await createEmailManagerHarness({
      send: currentSend,
      store,
    });

    await expect(
      current.manager.getNotification(sent.notificationId),
    ).resolves.toMatchObject({
      deliveries: [
        {
          retry: {
            allowed: true,
            mode: 'duplicate_risk_confirmation_required',
          },
        },
      ],
    });
    expect(currentSend).not.toHaveBeenCalled();

    await current.manager.close();
    await current.queue.shutdown();
  });
});

async function waitForTerminalNotification(
  manager: {
    getNotification(
      id: string,
    ): Promise<NotificationStatusSnapshot | undefined>;
  },
  notificationId: string,
): Promise<NotificationStatusSnapshot> {
  return vi.waitFor(async () => {
    const snapshot = await manager.getNotification(notificationId);
    if (!snapshot)
      throw new Error(`Notification "${notificationId}" was not found.`);
    expect(snapshot.terminal).toBe(true);
    return snapshot;
  });
}

async function createEmailManagerHarness(input: {
  readonly send: (
    input: NotificationProviderSendInput,
  ) => Promise<ProviderSendResult>;
  readonly capabilities?: NotificationProviderCapabilities;
  readonly database?: DatabaseManager;
  readonly store?: NotificationStore;
  readonly reconcileIntervalMs?: number;
  readonly prepare?: (message: object) => object | Promise<object>;
}) {
  const queue = createQueueService({
    namespace: `notification-test-${randomUUID()}`,
  });
  await queue.setup();
  const store = input.store ?? new FakeNotificationStore();
  const manager = createNotificationManager({
    database: input.database ?? ({} as DatabaseManager),
    queue,
    reconcileIntervalMs: input.reconcileIntervalMs,
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
  manager.registry
    .registerChannel({
      type: 'email',
      async createChannel() {
        return {
          type: 'email',
          resolveRecipient({ recipient }): object | undefined {
            return recipient?.type === 'email'
              ? { address: recipient.address }
              : undefined;
          },
          render({ content }): object {
            return { subject: content.title, text: content.body };
          },
          async prepare({ message }): Promise<object> {
            return input.prepare ? input.prepare(message) : message;
          },
        };
      },
    })
    .registerProvider('email', {
      type: 'fake',
      capabilities: input.capabilities,
      async createProvider(_context, config) {
        return {
          name: config.name,
          type: config.type,
          capabilities: input.capabilities,
          send: input.send,
        };
      },
    });
  return { manager, queue, store };
}

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

class ControlledNowNotificationStore extends FakeNotificationStore {
  constructor(private currentTime: string) {
    super();
  }

  setNow(value: string): void {
    this.currentTime = value;
  }

  override async now(): Promise<string> {
    return this.currentTime;
  }
}

class ExpiringStartAttemptNotificationStore extends ControlledNowNotificationStore {
  constructor(
    currentTime: string,
    private readonly expiresAfterStart: string,
  ) {
    super(currentTime);
  }

  override async startAttempt(
    delivery: NotificationDeliveryRecord,
    attempt: NotificationAttemptRecord,
    leaseExpiresAt: string,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const started = await super.startAttempt(delivery, attempt, leaseExpiresAt);
    if (attempt.sequence === 2) this.setNow(this.expiresAfterStart);
    return started;
  }
}

class DelayedLogNotificationStore extends FakeNotificationStore {
  private nextLogRead?: {
    readonly captured: () => void;
    readonly released: Promise<void>;
  };

  delayNextLogRead(): {
    readonly captured: Promise<void>;
    readonly release: () => void;
  } {
    let capture!: () => void;
    let release!: () => void;
    const captured = new Promise<void>((resolve) => {
      capture = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.nextLogRead = { captured: capture, released };
    return { captured, release };
  }

  override async getLog(id: string) {
    const gate = this.nextLogRead;
    if (gate) this.nextLogRead = undefined;
    const snapshot = await super.getLog(id);
    if (gate) {
      gate.captured();
      await gate.released;
    }
    return snapshot;
  }
}

class StaleLogStatusNotificationStore extends FakeNotificationStore {
  override async getLog(id: string) {
    const log = await super.getLog(id);
    return log ? { ...log, status: 'pending' as const } : undefined;
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
