import type { DatabaseManager } from '@nocobase/db';
import { createLogger } from '@nocobase/logging';
import { createQueueManager, createSyncQueueConfig } from '@nocobase/queue';
import { expect, it } from 'vitest';
import { createNotificationManager } from '../server/manager.js';
import { createNotificationRegistry } from '../server/registry.js';
import { FakeNotificationStore } from './helpers/fake-notification-store.js';

it('isolates same-type instances, overrides and identically named providers', async () => {
  const store = new FakeNotificationStore();
  const queue = createQueueManager(createSyncQueueConfig());
  const sent: object[] = [];
  const registry = createNotificationRegistry();
  registry
    .registerChannel({
      type: 'email',
      test: {
        label: 'Email',
        fields: [],
        toSendInput: () => ({
          content: { body: 'test' },
          to: { type: 'email', address: 'test@example.com' },
        }),
      },
      async createChannel(_context, config) {
        return {
          type: 'email',
          resolveRecipient: ({ recipient }) => recipient,
          render: ({ content, override }) => ({
            ...content,
            ...override,
            instance: config.name,
          }),
          prepare: async ({ message }) => message,
        };
      },
    })
    .registerProvider('email', {
      type: 'fake',
      async createProvider(_context, config) {
        return {
          name: config.name,
          type: 'fake',
          send: async ({ message }) => {
            sent.push(message);
            return { status: 'accepted' };
          },
        };
      },
    });
  const manager = createNotificationManager({
    database: {} as DatabaseManager,
    queue,
    store,
    registry,
    logger: createLogger({ level: 'silent' }),
    config: {
      channels: [
        {
          name: 'system-email',
          type: 'email',
          enabled: true,
          providers: [{ name: 'primary', type: 'fake' }],
        },
        {
          name: 'marketing-email',
          type: 'email',
          enabled: true,
          providers: [{ name: 'primary', type: 'fake' }],
        },
      ],
    },
  });
  try {
    await manager.start();
    expect(manager.listTestTargets().map((target) => target.channel)).toEqual([
      { name: 'system-email', type: 'email', label: 'Email' },
      { name: 'marketing-email', type: 'email', label: 'Email' },
    ]);
    const result = await manager.send({
      idempotencyKey: 'named',
      to: { type: 'email', address: 'test@example.com' },
      channels: ['system-email', 'marketing-email', 'system-email'],
      content: { body: 'base' },
      channelOverrides: { 'marketing-email': { body: 'offer' } },
      routing: { 'system-email': { providers: { provider: 'primary' } } },
    });
    expect(result.deliveries).toEqual([
      expect.objectContaining({
        channelName: 'system-email',
        channelType: 'email',
        status: 'accepted',
      }),
      expect.objectContaining({
        channelName: 'marketing-email',
        channelType: 'email',
        status: 'accepted',
      }),
    ]);
    expect(sent).toEqual([
      { body: 'base', instance: 'system-email' },
      { body: 'offer', instance: 'marketing-email' },
    ]);
    await expect(
      manager.send({
        idempotencyKey: 'wrong-name',
        channels: ['email'] as never,
        content: { body: 'test' },
      }),
    ).rejects.toThrow('not enabled');
    await manager.sendTest(
      {
        channel: 'marketing-email',
        provider: { name: 'primary', type: 'fake' },
        values: {},
      },
      { userId: 'user' },
    );
    expect(sent.at(-1)).toMatchObject({ instance: 'marketing-email' });
  } finally {
    await manager.close();
    await queue.close();
  }
});

it.each(['', ' padded', 'padded ', 'x'.repeat(101)])(
  'rejects invalid channel name %j even when disabled',
  (name) => {
    expect(() =>
      createNotificationRegistry().validate({
        channels: [{ name, type: 'email', enabled: false, providers: [] }],
      }),
    ).toThrow('Channel name');
  },
);

it('rejects duplicate names across types and disabled configurations', () => {
  expect(() =>
    createNotificationRegistry().validate({
      channels: [
        { name: 'same', type: 'email', enabled: false, providers: [] },
        { name: 'same', type: 'in-app', enabled: false, providers: [] },
      ],
    }),
  ).toThrow('duplicated');
});

it.each(['removed', 'disabled', 'changed'] as const)(
  'does not retry through another instance when the original is %s',
  async (mode) => {
    const store = new FakeNotificationStore();
    const registry = createNotificationRegistry();
    for (const type of ['email', 'im']) {
      registry.registerChannel({
        type,
        async createChannel() {
          return {
            type,
            resolveRecipient: ({ recipient }) => recipient,
            render: ({ content }) => content,
            prepare: async ({ message }) => message,
          };
        },
      });
      registry.registerProvider(type, {
        type: 'fake',
        async createProvider(_context, config) {
          return {
            name: config.name,
            type: 'fake',
            send: async () => ({
              status: 'failed',
              disposition: 'never',
              error: { message: 'test failure' },
            }),
          };
        },
      });
    }
    const original = {
      name: 'system',
      type: 'email',
      enabled: true,
      providers: [{ name: 'primary', type: 'fake' }],
    };
    const queue = createQueueManager(createSyncQueueConfig());
    const create = (channels: (typeof original)[]) =>
      createNotificationManager({
        database: {} as DatabaseManager,
        store,
        registry,
        queue,
        config: { channels },
        logger: createLogger({ level: 'silent' }),
      });
    const first = create([original]);
    await first.start();
    const result = await first.send({
      idempotencyKey: `retry-${mode}`,
      channels: ['system'],
      to: { type: 'email', address: 'test@example.com' },
      content: { body: 'test' },
    });
    await first.close();
    const manager = create([
      { ...original, name: 'other' },
      ...(mode === 'removed'
        ? []
        : [
            {
              ...original,
              enabled: mode !== 'disabled',
              type: mode === 'changed' ? 'im' : 'email',
            },
          ]),
    ]);
    try {
      await manager.start();
      expect(
        (await manager.getNotification(result.notificationId))?.deliveries[0]
          .retry.allowed,
      ).toBe(false);
      await expect(
        manager.retryDelivery({
          deliveryId: result.deliveries[0].id,
          reason: 'retry',
        }),
      ).rejects.toThrow();
      expect(
        (await store.getDelivery(result.deliveries[0].id))?.attemptCount,
      ).toBe(1);
    } finally {
      await manager.close();
      await queue.close();
    }
  },
);
