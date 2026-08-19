// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createMemoryPortalLivePublisher, type PortalLiveEvent } from '../../registry/portal-live/server/index.ts';
import { createMemoryNotificationStore, type DeliveryRecord, type NotificationRecord } from '../../registry/notification/server/domain.ts';
import { createLivePublishingNotificationStore } from '../../registry/notification/server/live.ts';

function createNotification(): NotificationRecord {
  return {
    id: 'notification-1',
    sourceType: 'system',
    principalService: 'tests',
    triggeredAt: '2026-08-19T00:00:00.000Z',
    messageMode: 'direct',
    summaryStatus: 'queued',
    version: 1,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
  };
}

function createDelivery(): DeliveryRecord {
  return {
    id: 'delivery-1',
    notificationId: 'notification-1',
    channel: 'in-app',
    recipientKey: 'user:user-1',
    recipientSnapshot: { userId: 'user-1' },
    recipientSchemaVersion: 1,
    contentSnapshot: { subject: 'Hello', body: 'World' },
    contentSchemaVersion: 1,
    providerChainSnapshot: ['in-app-db'],
    providerChainSchemaVersion: 1,
    providerCursor: 0,
    currentAttempt: 0,
    status: 'queued',
    statusChangedAt: '2026-08-19T00:00:00.000Z',
    version: 1,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
  };
}

async function createLiveStore() {
  const store = createMemoryNotificationStore();
  const publisher = createMemoryPortalLivePublisher();
  const events: PortalLiveEvent[] = [];
  publisher.subscribe('main', 'user-1', (event) => events.push(event));
  const liveStore = createLivePublishingNotificationStore(store, { publisher, appId: 'main' }, {
    warn: () => undefined,
  } as Parameters<typeof createLivePublishingNotificationStore>[2]);
  await store.createNotificationBundle({
    notification: createNotification(),
    deliveries: [createDelivery()],
    userNotificationItems: [{ id: 'item-1', deliveryId: 'delivery-1', notificationId: 'notification-1', userId: 'user-1', channel: 'in-app', availableAt: '2026-08-19T00:00:01.000Z', createdAt: '2026-08-19T00:00:00.000Z', updatedAt: '2026-08-19T00:00:00.000Z', version: 1 }],
  });
  return { store, liveStore, events };
}

describe('Portal Live notification publishing store', () => {
  it('publishes created events when a delivery reaches delivered', async () => {
    const { store, liveStore, events } = await createLiveStore();
    const claimed = await store.claimDelivery({
      deliveryId: 'delivery-1', expectedVersion: 1, leaseToken: 'lease-1', leaseOwner: 'worker-1',
      leaseExpiresAt: '2026-08-19T00:01:00.000Z', claimedAt: '2026-08-19T00:00:00.500Z',
    });
    expect(claimed).toBeDefined();
    await liveStore.transitionDelivery({
      deliveryId: 'delivery-1', expectedVersion: claimed!.version, fromStatus: 'sending', toStatus: 'delivered',
      statusChangedAt: '2026-08-19T00:00:02.000Z', leaseToken: 'lease-1',
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ channel: 'notifications/inbox', type: 'created', payload: { ids: ['item-1'] } });
  });

  it('does not publish when transition is rejected', async () => {
    const { liveStore, events } = await createLiveStore();
    const result = await liveStore.transitionDelivery({
      deliveryId: 'delivery-1', expectedVersion: 999, fromStatus: 'sending', toStatus: 'delivered', statusChangedAt: '2026-08-19T00:00:02.000Z',
    });
    expect(result).toBeUndefined();
    expect(events).toHaveLength(0);
  });

  it('publishes updated and unread-count-changed on read mutation', async () => {
    const { liveStore, events } = await createLiveStore();
    await liveStore.updateInboxItem({ itemId: 'item-1', userId: 'user-1', action: 'read', changedAt: '2026-08-19T00:00:03.000Z', expectedVersion: 1 });
    expect(events.map((event) => event.type)).toEqual(['updated', 'unread-count-changed']);
    expect(events[0].payload.ids).toEqual(['item-1']);
  });

  it('publishes deleted on delete mutation', async () => {
    const { liveStore, events } = await createLiveStore();
    await liveStore.updateInboxItem({ itemId: 'item-1', userId: 'user-1', action: 'delete', changedAt: '2026-08-19T00:00:03.000Z', expectedVersion: 1 });
    expect(events.map((event) => event.type)).toEqual(['deleted', 'unread-count-changed']);
  });

  it('skips publishing for a no-op mutation', async () => {
    const { liveStore, events } = await createLiveStore();
    await liveStore.updateInboxItem({ itemId: 'item-1', userId: 'user-1', action: 'read', changedAt: '2026-08-19T00:00:03.000Z', expectedVersion: 1 });
    events.length = 0;
    await liveStore.updateInboxItem({ itemId: 'item-1', userId: 'user-1', action: 'read', changedAt: '2026-08-19T00:00:04.000Z', expectedVersion: 2 });
    expect(events).toHaveLength(0);
  });
});