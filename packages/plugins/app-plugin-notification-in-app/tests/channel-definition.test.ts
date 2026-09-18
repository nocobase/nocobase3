import type {
  NotificationChannelContext,
  NotificationProviderContext,
} from '@nocobase/app-plugin-notification';
import { describe, expect, it, vi } from 'vitest';

import {
  createDatabaseProviderDefinition,
  createInAppChannelDefinition,
} from '../server/definition.js';
import { MemoryInAppStore } from '../server/store.js';

describe('In-app Channel common input', () => {
  it('checks recipients at final delivery and does not store or publish for missing users', async () => {
    const store = new MemoryInAppStore();
    const deliver = vi.spyOn(store, 'deliver');
    const recipientExists = vi.fn().mockResolvedValue(false);
    const provider = await createDatabaseProviderDefinition({
      store,
      recipientExists,
    }).createProvider(
      {
        logger: {} as NotificationProviderContext['logger'],
        now: async () => '2026-09-18T00:00:00.000Z',
      },
      { type: 'database', name: 'default' },
    );
    const input = {
      notificationId: 'notification-1',
      deliveryId: 'delivery-1',
      attemptId: 'attempt-1',
      deadline: '2026-09-18T00:01:00.000Z',
      signal: new AbortController().signal,
      message: {
        deliveryId: 'delivery-1',
        notificationId: 'notification-1',
        recipient: { userId: 'missing' },
        content: { body: 'Test' },
      },
    };
    await expect(provider.send(input)).resolves.toMatchObject({
      status: 'failed',
      disposition: 'never',
      error: {
        category: 'recipient',
        message: 'In-app notification recipient does not exist.',
      },
    });
    expect(recipientExists).toHaveBeenCalledWith('missing');
    expect(deliver).not.toHaveBeenCalled();
    recipientExists.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(provider.send(input)).resolves.toMatchObject({
      status: 'failed',
      disposition: 'same_provider',
      error: { category: 'storage' },
    });
    expect(deliver).not.toHaveBeenCalled();
    recipientExists.mockResolvedValue(true);
    await expect(provider.send(input)).resolves.toEqual({ status: 'accepted' });
    expect(deliver).toHaveBeenCalledOnce();
    recipientExists.mockResolvedValue(false);
    await expect(
      provider.send({
        ...input,
        deliveryId: 'delivery-2',
        message: { ...input.message, deliveryId: 'delivery-2' },
      }),
    ).resolves.toMatchObject({ status: 'failed', disposition: 'never' });
    expect(deliver).toHaveBeenCalledOnce();
  });

  it('describes its test target without exposing storage terminology', () => {
    const store = new MemoryInAppStore();

    expect(createInAppChannelDefinition().test?.label).toMatchObject({
      key: 'test.channels.inApp',
      defaultValue: 'In-app',
    });
    expect(
      createDatabaseProviderDefinition({
        store,
        recipientExists: async () => true,
      }).label,
    ).toMatchObject({
      key: 'test.providers.builtIn',
      defaultValue: 'Built-in',
    });
  });

  it('defaults test delivery to the authenticated user', () => {
    const adapter = createInAppChannelDefinition().test;
    expect(
      adapter?.toSendInput({
        actor: { userId: 'user-1' },
        values: { title: 'Test', body: 'Hello' },
        channelConfig: {
          type: 'in-app',
          enabled: true,
          providers: [],
        },
        providerConfig: { type: 'database', name: 'default' },
      }),
    ).toEqual({
      to: { type: 'user', id: 'user-1' },
      content: { title: 'Test', body: 'Hello' },
    });
  });

  it('resolves user recipients and renders content with overrides', async () => {
    const definition = createInAppChannelDefinition();
    const channel = await definition.createChannel(
      { logger: {} } as NotificationChannelContext,
      { type: 'in-app', enabled: true, providers: [] },
    );
    const provider = { name: 'default', type: 'database' };

    expect(
      channel.resolveRecipient?.({
        recipient: { type: 'user', id: 'user-1' },
        provider,
      }),
    ).toEqual({ userId: 'user-1' });
    expect(
      channel.resolveRecipient?.({
        recipient: {
          type: 'email',
          address: 'alice@example.com',
        },
        provider,
      }),
    ).toBeUndefined();
    expect(
      channel.render?.({
        content: {
          title: 'Approval complete',
          body: 'Review the result.',
          actionUrl: '/approvals/1',
        },
        override: { title: 'In-app title' },
      }),
    ).toEqual({
      title: 'In-app title',
      body: 'Review the result.',
      actionUrl: '/approvals/1',
    });
  });

  it('delivers through an explicitly injected store with the minimal Provider context', async () => {
    const store = new MemoryInAppStore();
    const provider = await createDatabaseProviderDefinition({
      store,
      recipientExists: async () => true,
    }).createProvider(
      {
        logger: {} as NotificationProviderContext['logger'],
        async now(): Promise<string> {
          return '2026-08-27T00:00:00.000Z';
        },
      },
      { type: 'database', name: 'default' },
    );

    expect(provider.capabilities).toEqual({
      idempotency: { supported: true },
    });
    await expect(
      provider.send({
        notificationId: 'notification-1',
        deliveryId: 'delivery-1',
        attemptId: 'attempt-1',
        deadline: '2026-08-27T00:01:00.000Z',
        signal: new AbortController().signal,
        message: {
          deliveryId: 'delivery-1',
          notificationId: 'notification-1',
          recipient: { userId: 'user-1' },
          content: { body: 'Review it.' },
        },
      }),
    ).resolves.toEqual({ status: 'accepted' });
    await expect(store.list({ userId: 'user-1' })).resolves.toEqual([
      expect.objectContaining({
        deliveryId: 'delivery-1',
        createdAt: '2026-08-27T00:00:00.000Z',
      }),
    ]);
  });
});
