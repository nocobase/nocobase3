import type {
  NotificationChannelContext,
  NotificationProviderContext,
} from '@nocobase/app-plugin-notification';
import { describe, expect, it } from 'vitest';

import {
  createDatabaseProviderDefinition,
  createInAppChannelDefinition,
} from '../server/definition.js';
import { MemoryInAppStore } from '../server/store.js';

describe('In-app Channel common input', () => {
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
        providerConfig: { type: 'database', name: 'primary' },
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
    const provider = { name: 'primary', type: 'database' };

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
    }).createProvider(
      {
        logger: {} as NotificationProviderContext['logger'],
        async now(): Promise<string> {
          return '2026-08-27T00:00:00.000Z';
        },
      },
      { type: 'database', name: 'primary' },
    );

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
