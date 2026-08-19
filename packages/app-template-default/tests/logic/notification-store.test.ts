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
  it.each([
    ['memory', async () => ({ store: createMemoryNotificationStore(), close: async () => undefined })],
    ['database', createDatabaseStore],
  ])('creates a notification bundle atomically through the %s adapter', async (_name, setup) => {
    const { store, close } = await setup();
    const notification = createNotification();
    const delivery = createDelivery();
    const item = createUserItem();

    await store.createNotificationBundle({ notification, deliveries: [delivery], userNotificationItems: [item] });

    await expect(store.getNotification(notification.id)).resolves.toMatchObject({ id: notification.id });
    await expect(store.getDelivery(delivery.id)).resolves.toMatchObject({ id: delivery.id });
    await expect(store.listInbox({ userId: 'user-1' })).resolves.toEqual([]);
    await close();
  });

  it.each([
    ['memory', async () => ({ store: createMemoryNotificationStore(), close: async () => undefined })],
    ['database', createDatabaseStore],
  ])('claims only due queued work once through the %s adapter', async (_name, setup) => {
    const { store, close } = await setup();
    await store.createNotificationBundle({ notification: createNotification(), deliveries: [createDelivery()] });

    await expect(store.listDueDeliveries({ now: '2026-08-19T00:00:01.000Z', limit: 10 })).resolves.toHaveLength(1);
    await expect(store.claimDelivery({
      deliveryId: 'delivery-1', expectedVersion: 1, leaseToken: 'lease-1', leaseOwner: 'worker-1',
      leaseExpiresAt: '2026-08-19T00:01:00.000Z', claimedAt: '2026-08-19T00:00:01.000Z',
    })).resolves.toMatchObject({ status: 'sending', leaseToken: 'lease-1', version: 2 });
    await expect(store.claimDelivery({
      deliveryId: 'delivery-1', expectedVersion: 1, leaseToken: 'lease-2', leaseOwner: 'worker-2',
      leaseExpiresAt: '2026-08-19T00:01:00.000Z', claimedAt: '2026-08-19T00:00:01.000Z',
    })).resolves.toBeUndefined();
    await close();
  });

  it.each([
    ['memory', async () => ({ store: createMemoryNotificationStore(), close: async () => undefined })],
    ['database', createDatabaseStore],
  ])('exposes only visible owned inbox items and applies optimistic mutations through the %s adapter', async (_name, setup) => {
    const { store, close } = await setup();
    await store.createNotificationBundle({
      notification: createNotification(), deliveries: [createDelivery()],
      userNotificationItems: [{ ...createUserItem(), availableAt: '2026-08-19T00:00:01.000Z' }],
    });

    await expect(store.listInbox({ userId: 'other-user' })).resolves.toEqual([]);
    await expect(store.countUnread({ userId: 'user-1' })).resolves.toBe(1);
    await expect(store.updateInboxItem({ itemId: 'item-1', userId: 'user-1', action: 'read', changedAt: '2026-08-19T00:00:02.000Z', expectedVersion: 1 })).resolves.toMatchObject({ readAt: '2026-08-19T00:00:02.000Z', version: 2 });
    await expect(store.countUnread({ userId: 'user-1' })).resolves.toBe(0);
    await close();
  });

  it.each([
    ['memory', async () => ({ store: createMemoryNotificationStore(), close: async () => undefined })],
    ['database', createDatabaseStore],
  ])('recovers expired work conservatively through the %s adapter', async (_name, setup) => {
    const { store, close } = await setup();
    await store.createNotificationBundle({ notification: createNotification(), deliveries: [createDelivery()] });
    await store.claimDelivery({ deliveryId: 'delivery-1', expectedVersion: 1, leaseToken: 'lease-1', leaseOwner: 'worker-1', leaseExpiresAt: '2026-08-19T00:00:01.000Z', claimedAt: '2026-08-19T00:00:00.000Z',
      attempt: { id: 'attempt-1', deliveryId: 'delivery-1', attemptSequence: 1, providerInstance: 'email/smtp/primary', providerType: 'smtp', status: 'sending', startedAt: '2026-08-19T00:00:00.000Z', metadataSchemaVersion: 1, createdAt: '2026-08-19T00:00:00.000Z', updatedAt: '2026-08-19T00:00:00.000Z' },
    });
    await expect(store.recoverExpiredDeliveries('2026-08-19T00:00:02.000Z')).resolves.toMatchObject([{ status: 'queued', leaseToken: undefined }]);

    const queued = await store.getDelivery('delivery-1');
    await store.claimDelivery({ deliveryId: 'delivery-1', expectedVersion: queued!.version, leaseToken: 'lease-2', leaseOwner: 'worker-2', leaseExpiresAt: '2026-08-19T00:00:03.000Z', claimedAt: '2026-08-19T00:00:02.000Z',
      attempt: { id: 'attempt-2', deliveryId: 'delivery-1', attemptSequence: 2, providerInstance: 'email/smtp/primary', providerType: 'smtp', status: 'sending', startedAt: '2026-08-19T00:00:02.000Z', invocationStartedAt: '2026-08-19T00:00:02.500Z', metadataSchemaVersion: 1, createdAt: '2026-08-19T00:00:02.000Z', updatedAt: '2026-08-19T00:00:02.500Z' },
    });
    await expect(store.recoverExpiredDeliveries('2026-08-19T00:00:04.000Z')).resolves.toMatchObject([{ status: 'submission_unknown' }]);
    await close();
  });

  it.each([
    ['memory', async () => ({ store: createMemoryNotificationStore(), close: async () => undefined })],
    ['database', createDatabaseStore],
  ])('lists deliveries with fixed filters, ordering, count, and pagination through the %s adapter', async (_name, setup) => {
    const { store, close } = await setup();
    await store.createNotificationBundle({ notification: createNotification(), deliveries: [createDelivery()] });
    await store.createNotificationBundle({ notification: { ...createNotification(), id: 'notification-2', updatedAt: '2026-08-19T00:00:02.000Z' }, deliveries: [{ ...createDelivery(), id: 'delivery-2', notificationId: 'notification-2', recipientKey: 'user:user-2', status: 'failed', updatedAt: '2026-08-19T00:00:02.000Z' }] });

    await expect(store.listDeliveries({ page: 1, pageSize: 1 })).resolves.toMatchObject([{ id: 'delivery-2' }]);
    await expect(store.listDeliveries({ status: 'queued', search: 'user-1', page: 1, pageSize: 25 })).resolves.toMatchObject([{ id: 'delivery-1' }]);
    await expect(store.countDeliveries({ channel: 'in-app' })).resolves.toBe(2);
    await close();
  });

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

async function createDatabaseStore() {
  const database = createDatabaseManager({ default: 'sqlite', connections: { sqlite: { dialect: 'sqlite', filename: ':memory:' } } });
  const directory = fileURLToPath(new URL('../../server/migrations', import.meta.url));
  await createMigrator({ database, directory }).latest();
  return { store: createDatabaseNotificationStore(database), close: () => database.destroy() };
}

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

function createUserItem() {
  return {
    id: 'item-1', deliveryId: 'delivery-1', notificationId: 'notification-1', userId: 'user-1', channel: 'in-app' as const,
    createdAt: '2026-08-19T00:00:00.000Z', updatedAt: '2026-08-19T00:00:00.000Z', version: 1,
  };
}
