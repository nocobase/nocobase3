import { createLogger, type DestinationStream } from '@nocobase/logging';
import { createQueueManager, createSyncQueueConfig } from '@nocobase/queue';
import type { DatabaseManager } from '@nocobase/db';
import { describe, expect, it, vi } from 'vitest';

import { createNotificationManager } from '../server/manager.js';
import type { NotificationDeliveryRecord } from '../server/store.js';
import type {
  NotificationProviderCapabilities,
  NotificationProviderSendInput,
  ProviderSendResult,
} from '../server/types.js';
import { createNotificationTestDatabase } from './helpers/database.js';
import { FakeNotificationStore } from './helpers/fake-notification-store.js';

describe('NotificationManager registration', () => {
  it('does not activate persistence or queue resources without enabled Channels', async () => {
    const queue = createQueueManager(createSyncQueueConfig());
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
    await queue.close();
  });

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

    await queue.close();
    await database.destroy();
  });

  it('emits structured lifecycle logs without notification content', async () => {
    const output = createMemoryDestination();
    const resolvedProviders: object[] = [];
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
      idempotencyKey: 'manager-structured-logs',
      source: { type: 'test' },
      to: { type: 'email', address: 'private@example.com' },
      channels: ['email'],
      content: { title: 'private subject', body: 'private body' },
    });
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

    await queue.close();
    await database.destroy();
  });

  it('selects a non-primary Provider by name with the default single strategy', async () => {
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
              return recipient.type === 'target'
                ? { providerName: provider.name }
                : undefined;
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
      to: { type: 'target', id: 'ops-alerts' },
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
    await expect(store.listDeliveries(result.notificationId)).resolves.toEqual([
      expect.objectContaining({
        providerName: 'secondary',
        status: 'accepted',
        recipientSnapshot: { providerName: 'secondary' },
      }),
    ]);

    await manager.close();
    await queue.close();
    await database.destroy();
  });

  it('routes to all enabled Providers as independent Deliveries', async () => {
    const queue = createQueueManager(createSyncQueueConfig());
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
            return recipient.type === 'target' ? { provider } : undefined;
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
      to: { type: 'target', id: 'ops-alerts' },
      channels: ['im'],
      routing: { im: { providers: { strategy: 'all' } } },
      content: { body: 'Send it everywhere.' },
    });
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
      to: { type: 'target', id: 'ops-alerts' },
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
    await expect(
      store.listDeliveries(selectedResult.notificationId),
    ).resolves.toEqual([
      expect.objectContaining({
        providerName: 'dingtalk',
        providerType: 'dingtalk-webhook',
        status: 'accepted',
      }),
    ]);
    expect(send).toHaveBeenCalledTimes(3);

    await manager.close();
    await queue.close();
    await database.destroy();
  });

  it('rejects an explicitly routed Provider that is not enabled', async () => {
    const queue = createQueueManager(createSyncQueueConfig());
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
        to: { type: 'target', id: 'ops-alerts' },
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
      manager.registry
        .registerChannel({
          type: channelType,
          async createChannel() {
            return {
              type: channelType,
              async resolveRecipient({
                recipient,
              }): Promise<object | undefined> {
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
    const partialDeliveries = await store.listDeliveries(
      partialResult.notificationId,
    );
    expect(partialResult.status).toBe('partial');
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

    manager.registry.registerProvider('email', definition);

    expect(() =>
      manager.registry.registerProvider('email', definition),
    ).toThrow('already registered for Channel "email"');

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

    await queue.close();
    await database.destroy();
  });

  it('deduplicates repeated sends and rejects reuse with different content', async () => {
    const send = vi.fn(async () => ({ status: 'accepted' }) as const);
    const { manager, queue } = createEmailManagerHarness({ send });
    const input = {
      idempotencyKey: 'order-won:42:user-7:email',
      to: { type: 'email', address: 'buyer@example.com' } as const,
      channels: ['email'] as const,
      content: { title: 'Order won', body: 'Order 42 was won.' },
    };

    const first = await manager.send(input);
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
    await queue.close();
  });

  it('emits process-local status events without awaiting listener work', async () => {
    const { manager, queue } = createEmailManagerHarness({
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
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    expect(result.status).toBe('completed');
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'status-event-1',
        notificationId: result.notificationId,
      }),
    );
    unsubscribe();
    await manager.close();
    await queue.close();
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
    const { manager, queue } = createEmailManagerHarness({ send, store });
    const sent = await manager.send({
      idempotencyKey: 'status-event-order-1',
      to: { type: 'email', address: 'buyer@example.com' },
      channels: ['email'],
      content: { body: 'Ordered status event.' },
    });
    const gate = store.delayNextLogRead();
    const statuses: string[] = [];
    const unsubscribe = manager.onStatusChanged(
      { notificationId: sent.notificationId },
      (event) => {
        statuses.push(event.status);
      },
    );
    await gate.captured;

    await manager.retryDelivery({ deliveryId: sent.deliveries[0]!.id });
    await vi.waitFor(() => expect(statuses).toContain('completed'));
    gate.release();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(statuses.at(-1)).toBe('completed');
    unsubscribe();
    await manager.close();
    await queue.close();
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
    const { manager, queue, store } = createEmailManagerHarness({ send });
    const sent = await manager.send({
      idempotencyKey: 'retry-failed-1',
      to: { type: 'email', address: 'buyer@example.com' },
      channels: ['email'],
      content: { body: 'Retry failure.' },
    });

    expect(sent.deliveries[0]).toMatchObject({
      status: 'failed',
      retry: { allowed: true, mode: 'safe' },
    });
    await expect(
      manager.retryDelivery({ deliveryId: sent.deliveries[0]!.id }),
    ).resolves.toMatchObject({ status: 'accepted', attemptCount: 2 });
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
    await queue.close();
  });

  it('requires an explicit resolution before retrying an unsafe unknown Delivery', async () => {
    const send = vi
      .fn<
        (input: NotificationProviderSendInput) => Promise<ProviderSendResult>
      >()
      .mockResolvedValueOnce({
        status: 'submission_unknown',
        error: { message: 'connection lost', category: 'network' },
      })
      .mockResolvedValueOnce({ status: 'accepted' });
    const { manager, queue, store } = createEmailManagerHarness({ send });
    const sent = await manager.send({
      idempotencyKey: 'retry-unknown-unsafe-1',
      to: { type: 'email', address: 'buyer@example.com' },
      channels: ['email'],
      content: { body: 'Unknown result.' },
    });
    const deliveryId = sent.deliveries[0]!.id;

    expect(sent.deliveries[0]).toMatchObject({
      status: 'unknown',
      retry: {
        allowed: false,
        mode: 'duplicate_risk_confirmation_required',
      },
    });
    await expect(manager.retryDelivery({ deliveryId })).rejects.toMatchObject({
      code: 'NOTIFICATION_DELIVERY_RETRY_NOT_ALLOWED',
    });
    await expect(
      manager.retryDelivery({
        deliveryId,
        resolution: {
          type: 'accept_duplicate_risk',
          reason:
            'The business owner prefers a possible duplicate to an omission.',
        },
      }),
    ).resolves.toMatchObject({ status: 'accepted', attemptCount: 2 });
    await expect(store.listAttempts(deliveryId)).resolves.toMatchObject([
      { sequence: 1 },
      {
        sequence: 2,
        retryResolution: { type: 'accept_duplicate_risk' },
      },
    ]);

    await manager.close();
    await queue.close();
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
      idempotency: { supported: true, key: 'deliveryId' },
    } as const satisfies NotificationProviderCapabilities;
    const { manager, queue } = createEmailManagerHarness({
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

    expect(sent.deliveries[0]?.retry).toMatchObject({
      allowed: true,
      mode: 'safe',
    });
    await expect(manager.retryDelivery({ deliveryId })).resolves.toMatchObject({
      status: 'accepted',
    });
    expect(send.mock.calls.map(([input]) => input.deliveryId)).toEqual([
      deliveryId,
      deliveryId,
    ]);

    await manager.close();
    await queue.close();
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
    const { manager, queue } = createEmailManagerHarness({
      send,
      store,
      capabilities: {
        idempotency: {
          supported: true,
          key: 'deliveryId',
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

    store.setNow('2026-09-01T23:00:00.000Z');
    await expect(manager.retryDelivery({ deliveryId })).resolves.toMatchObject({
      status: 'unknown',
      attemptCount: 2,
    });
    store.setNow('2026-09-02T01:00:00.000Z');

    await expect(
      manager.getNotification(sent.notificationId),
    ).resolves.toMatchObject({
      deliveries: [
        {
          retry: {
            allowed: false,
            mode: 'duplicate_risk_confirmation_required',
          },
        },
      ],
    });
    await expect(manager.retryDelivery({ deliveryId })).rejects.toMatchObject({
      code: 'NOTIFICATION_DELIVERY_RETRY_NOT_ALLOWED',
    });
    expect(send).toHaveBeenCalledTimes(2);

    await manager.close();
    await queue.close();
  });

  it('stops a safe retry when its Provider idempotency window expires during preparation', async () => {
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
    const { manager, queue } = createEmailManagerHarness({
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
          key: 'deliveryId',
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
    store.setNow('2026-09-01T00:00:00.900Z');

    await expect(manager.retryDelivery({ deliveryId })).resolves.toMatchObject({
      status: 'unknown',
      attemptCount: 1,
      error: { code: 'PROVIDER_IDEMPOTENCY_EXPIRED' },
      retry: {
        allowed: false,
        mode: 'duplicate_risk_confirmation_required',
      },
    });
    expect(send).toHaveBeenCalledOnce();

    await manager.close();
    await queue.close();
  });

  it('does not infer idempotency for an old unknown attempt from new Provider capabilities', async () => {
    const store = new FakeNotificationStore();
    const firstSend = vi.fn(async (): Promise<ProviderSendResult> => ({
      status: 'submission_unknown',
      error: { message: 'response lost', category: 'network' },
    }));
    const first = createEmailManagerHarness({ send: firstSend, store });
    const sent = await first.manager.send({
      idempotencyKey: 'retry-unknown-capability-upgrade-1',
      to: { type: 'email', address: 'buyer@example.com' },
      channels: ['email'],
      content: { body: 'Capability changes after submission.' },
    });
    await first.manager.close();
    await first.queue.close();

    const upgradedSend = vi.fn(async (): Promise<ProviderSendResult> => ({
      status: 'accepted',
    }));
    const upgraded = createEmailManagerHarness({
      send: upgradedSend,
      store,
      capabilities: {
        idempotency: { supported: true, key: 'deliveryId' },
      },
    });

    await expect(
      upgraded.manager.retryDelivery({ deliveryId: sent.deliveries[0]!.id }),
    ).rejects.toMatchObject({
      code: 'NOTIFICATION_DELIVERY_RETRY_NOT_ALLOWED',
    });
    expect(upgradedSend).not.toHaveBeenCalled();

    await upgraded.manager.close();
    await upgraded.queue.close();
  });

  it('does not use persisted idempotency evidence after the Provider drops that capability', async () => {
    const store = new FakeNotificationStore();
    const first = createEmailManagerHarness({
      store,
      send: async () => ({
        status: 'submission_unknown',
        error: { message: 'response lost', category: 'network' },
      }),
      capabilities: {
        idempotency: { supported: true, key: 'deliveryId' },
      },
    });
    const sent = await first.manager.send({
      idempotencyKey: 'retry-unknown-capability-removed-1',
      to: { type: 'email', address: 'buyer@example.com' },
      channels: ['email'],
      content: { body: 'Capability removed after submission.' },
    });
    await first.manager.close();
    await first.queue.close();

    const currentSend = vi.fn(async (): Promise<ProviderSendResult> => ({
      status: 'accepted',
    }));
    const current = createEmailManagerHarness({ send: currentSend, store });

    await expect(
      current.manager.retryDelivery({ deliveryId: sent.deliveries[0]!.id }),
    ).rejects.toMatchObject({
      code: 'NOTIFICATION_DELIVERY_RETRY_NOT_ALLOWED',
    });
    expect(currentSend).not.toHaveBeenCalled();

    await current.manager.close();
    await current.queue.close();
  });
});

function createEmailManagerHarness(input: {
  readonly send: (
    input: NotificationProviderSendInput,
  ) => Promise<ProviderSendResult>;
  readonly capabilities?: NotificationProviderCapabilities;
  readonly store?: FakeNotificationStore;
  readonly prepare?: (message: object) => object | Promise<object>;
}) {
  const queue = createQueueManager(createSyncQueueConfig());
  const store = input.store ?? new FakeNotificationStore();
  const manager = createNotificationManager({
    database: {} as DatabaseManager,
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
          resolveRecipient({ recipient }): object | undefined {
            return recipient.type === 'email'
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
