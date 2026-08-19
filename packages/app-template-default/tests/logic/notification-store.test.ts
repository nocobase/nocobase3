// @vitest-environment node

import { fileURLToPath } from 'node:url';

import { createDatabaseManager, createMigrator } from '@nocobase/database';
import { describe, expect, it } from 'vitest';

import {
  createMemoryNotificationStore,
  createDatabaseNotificationStore,
  type DeliveryRecord,
  type NotificationRecord,
} from '../../registry/notification/server/domain.ts';

describe('NotificationStore contract', () => {
  it('keeps notification and delivery snapshots isolated from caller mutation', async () => {
    const store = createMemoryNotificationStore();
    const notification = createNotification();
    const delivery = createDelivery();

    await store.createNotification(notification);
    await store.createDelivery(delivery);
    notification.sourceType = 'mutated';
    delivery.contentSnapshot.subject = 'mutated';

    await expect(store.getNotification(notification.id)).resolves.toMatchObject({ sourceType: 'system' });
    await expect(store.getDelivery(delivery.id)).resolves.toMatchObject({
      contentSnapshot: { subject: 'Hello' },
    });
  });

  it('persists the same snapshot and CAS contract through DatabaseManager', async () => {
    const database = createDatabaseManager({
      default: 'sqlite',
      connections: {
        sqlite: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
    const directory = fileURLToPath(new URL('../../server/migrations', import.meta.url));
    await createMigrator({ database, directory }).latest();
    const store = createDatabaseNotificationStore(database);
    const notification = createNotification();
    const delivery = createDelivery();

    await store.createNotification(notification);
    await store.createDelivery(delivery);
    const transitioned = await store.transitionDelivery({
      deliveryId: delivery.id,
      expectedVersion: 1,
      fromStatus: 'queued',
      toStatus: 'sending',
      statusChangedAt: '2026-08-19T00:00:01.000Z',
    });

    expect(transitioned).toMatchObject({ status: 'sending', version: 2 });
    await expect(store.getNotification(notification.id)).resolves.toMatchObject({ sourceType: 'system' });
    await expect(store.getDelivery(delivery.id)).resolves.toMatchObject({
      recipientSnapshot: { userId: 'user-1' },
      contentSnapshot: { subject: 'Hello', body: 'World' },
      providerChainSnapshot: ['in-app-db'],
    });

    await database.destroy();
  });

  it('uses version and status compare-and-set for delivery transitions', async () => {
    const store = createMemoryNotificationStore();
    const delivery = createDelivery();
    await store.createDelivery(delivery);

    await expect(
      store.transitionDelivery({
        deliveryId: delivery.id,
        expectedVersion: 2,
        fromStatus: 'queued',
        toStatus: 'sending',
        statusChangedAt: '2026-08-19T00:00:01.000Z',
      }),
    ).resolves.toBeUndefined();

    await expect(
      store.transitionDelivery({
        deliveryId: delivery.id,
        expectedVersion: 1,
        fromStatus: 'queued',
        toStatus: 'sending',
        statusChangedAt: '2026-08-19T00:00:01.000Z',
      }),
    ).resolves.toMatchObject({ status: 'sending', version: 2 });

    await expect(
      store.transitionDelivery({
        deliveryId: delivery.id,
        expectedVersion: 1,
        fromStatus: 'queued',
        toStatus: 'failed',
        statusChangedAt: '2026-08-19T00:00:02.000Z',
      }),
    ).resolves.toBeUndefined();
  });
});

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
