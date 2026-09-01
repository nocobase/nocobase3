import type { DatabaseManager } from '@nocobase/db';
import { createLogger } from '@nocobase/logging';
import { createQueueManager, createSyncQueueConfig } from '@nocobase/queue';
import { describe, expect, it, vi } from 'vitest';

import { createNotificationManager } from '../server/manager.js';
import { createNotificationRegistry } from '../server/registry.js';
import type { NotificationConfig } from '../server/types.js';
import { FakeNotificationStore } from './helpers/fake-notification-store.js';

describe('notification test sending', () => {
  it('describes only registered definitions backed by enabled configuration', () => {
    const registry = createNotificationRegistry();
    registry
      .registerChannel({
        type: 'email',
        test: {
          label: 'Email',
          fields: [{ name: 'recipient', label: 'Recipient', type: 'email' }],
          toSendInput() {
            return {
              to: { type: 'email', address: 'safe@example.com' },
              content: { body: 'test' },
            };
          },
        },
        async createChannel() {
          throw new Error('not used');
        },
      })
      .registerProvider('email', {
        type: 'smtp',
        label: 'SMTP',
        async createProvider() {
          throw new Error('not used');
        },
      });

    const config = {
      channels: [
        {
          type: 'email',
          enabled: true,
          providers: [
            {
              type: 'smtp',
              name: 'primary',
              host: 'private.example.com',
              password: 'secret',
            },
            { type: 'missing', name: 'not-registered' },
            { type: 'smtp', name: 'disabled', enabled: false },
          ],
        },
      ],
    } as unknown as NotificationConfig;
    expect(registry.testTargets(config)).toEqual([
      {
        channel: { type: 'email', label: 'Email' },
        provider: { name: 'primary', type: 'smtp', label: 'SMTP' },
        fields: [{ name: 'recipient', label: 'Recipient', type: 'email' }],
      },
    ]);
  });

  it('converts adapter values into the normal send interface', async () => {
    const queue = createQueueManager(createSyncQueueConfig());
    const manager = createNotificationManager({
      database: {} as DatabaseManager,
      queue,
      logger: createLogger({ level: 'silent' }),
      config: {
        test: { enabled: true },
        channels: [
          {
            type: 'email',
            enabled: true,
            providers: [{ type: 'smtp', name: 'primary' }],
          },
        ],
      },
      store: new FakeNotificationStore(),
    });
    manager.registry
      .registerChannel({
        type: 'email',
        test: {
          label: 'Email',
          fields: [
            {
              name: 'recipient',
              label: 'Recipient',
              type: 'email',
              required: true,
            },
          ],
          toSendInput({ values }) {
            return {
              to: { type: 'email', address: values.recipient },
              content: { title: 'Test', body: 'Hello' },
            };
          },
        },
        async createChannel() {
          throw new Error('not used');
        },
      })
      .registerProvider('email', {
        type: 'smtp',
        async createProvider() {
          throw new Error('not used');
        },
      });
    const send = vi.spyOn(manager, 'send').mockResolvedValue({
      notificationId: 'test-1',
      status: 'pending',
      deliveries: [],
    });

    await manager.sendTest(
      {
        channel: 'email',
        providerName: 'primary',
        providerType: 'smtp',
        values: { recipient: 'safe@example.com' },
      },
      { userId: 'user-1' },
    );

    expect(send).toHaveBeenCalledWith({
      to: { type: 'email', address: 'safe@example.com' },
      channels: ['email'],
      routing: { email: { providers: { provider: 'primary' } } },
      content: { title: 'Test', body: 'Hello' },
      channelOverrides: undefined,
      source: { type: 'notification-test', referenceId: 'user-1' },
    });
    await manager.close();
    await queue.close();
  });

  it('returns test status only to the actor that created it', async () => {
    const queue = createQueueManager(createSyncQueueConfig());
    const store = new FakeNotificationStore();
    await store.create({
      log: {
        id: 'test-1',
        sourceType: 'notification-test',
        sourceReferenceId: 'user-1',
        messageSnapshot: {},
        status: 'completed',
        createdAt: '2026-08-31T00:00:00.000Z',
        updatedAt: '2026-08-31T00:00:00.000Z',
      },
      deliveries: [],
    });
    const manager = createNotificationManager({
      database: {} as DatabaseManager,
      queue,
      logger: createLogger({ level: 'silent' }),
      config: { channels: [], test: { enabled: true } },
      store,
    });

    await expect(
      manager.getTestStatus('test-1', { userId: 'user-1' }),
    ).resolves.toEqual(
      expect.objectContaining({
        log: expect.objectContaining({ id: 'test-1' }),
      }),
    );
    await expect(
      manager.getTestStatus('test-1', { userId: 'user-2' }),
    ).resolves.toBeUndefined();

    await queue.close();
  });
});
