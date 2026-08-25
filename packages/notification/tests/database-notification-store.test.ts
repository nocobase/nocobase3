import type { DatabaseManager } from '@nocobase/database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DatabaseNotificationStore,
  type NotificationAttemptRecord,
  type NotificationDeliveryRecord,
  type NotificationLogBundle,
} from '../src/store.js';
import { createNotificationTestDatabase } from './helpers/database.js';

describe('DatabaseNotificationStore', () => {
  let database: DatabaseManager;
  let store: DatabaseNotificationStore;

  beforeEach(async () => {
    database = await createNotificationTestDatabase();
    store = new DatabaseNotificationStore(database);
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('persists a delivery lifecycle and rejects stale state transitions', async () => {
    const bundle = createBundle();
    await store.create(bundle);

    await expect(
      store.listReady('2026-08-24T00:00:00.000Z'),
    ).resolves.toMatchObject([
      {
        id: 'delivery-1',
        providerChain: ['primary', 'secondary'],
        status: 'pending',
      },
    ]);

    const claimed = await store.claimDelivery(
      'delivery-1',
      'lease-1',
      '2026-08-24T00:01:00.000Z',
    );
    expect(claimed).toMatchObject({
      status: 'preparing',
      leaseToken: 'lease-1',
      version: 2,
    });
    await expect(
      store.claimDelivery('delivery-1', 'lease-2', '2026-08-24T00:02:00.000Z'),
    ).resolves.toBeUndefined();

    const attempt = createAttempt();
    const started = await store.startAttempt(
      claimed!,
      attempt,
      '2026-08-24T00:01:00.000Z',
    );
    expect(started).toMatchObject({ attemptCount: 1, version: 3 });
    await expect(
      store.startAttempt(
        claimed!,
        { ...attempt, id: 'attempt-stale' },
        '2026-08-24T00:01:00.000Z',
      ),
    ).resolves.toBeUndefined();

    const finishedAttempt: NotificationAttemptRecord = {
      ...attempt,
      status: 'accepted',
      finishedAt: '2026-08-24T00:00:02.000Z',
      providerMessageId: 'provider-message-1',
    };
    const finished = await store.finishAttemptAndDelivery(
      finishedAttempt,
      started!,
      'accepted',
    );
    expect(finished).toMatchObject({
      status: 'accepted',
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      version: 4,
    });
    await expect(store.getLog('notification-1')).resolves.toMatchObject({
      status: 'completed',
      messageSnapshot: { email: { subject: 'Hello' } },
    });
  });

  it('returns an expired preparation lease to pending', async () => {
    await store.create(createBundle());
    await store.claimDelivery(
      'delivery-1',
      'expired-lease',
      '2026-08-24T00:01:00.000Z',
    );

    await expect(
      store.recoverExpired('2026-08-24T00:02:00.000Z'),
    ).resolves.toBe(1);
    await expect(store.getDelivery('delivery-1')).resolves.toMatchObject({
      status: 'pending',
    });
    await expect(store.getLog('notification-1')).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('marks an expired Provider submission lease as unknown', async () => {
    await store.create(createBundle());
    const claimed = await store.claimDelivery(
      'delivery-1',
      'expired-submission',
      '2026-08-24T00:01:00.000Z',
    );
    await store.startAttempt(
      claimed!,
      createAttempt(),
      '2026-08-24T00:01:00.000Z',
    );

    await expect(
      store.recoverExpired('2026-08-24T00:02:00.000Z'),
    ).resolves.toBe(1);
    await expect(store.getDelivery('delivery-1')).resolves.toMatchObject({
      status: 'unknown',
      lastError: { code: 'LEASE_EXPIRED' },
    });
    await expect(store.listAttempts('delivery-1')).resolves.toMatchObject([
      {
        id: 'attempt-1',
        status: 'unknown',
        finishedAt: '2026-08-24T00:02:00.000Z',
        error: { code: 'LEASE_EXPIRED' },
      },
    ]);
    await expect(
      store.finishAttemptAndDelivery(
        {
          ...createAttempt(),
          status: 'accepted',
          finishedAt: '2026-08-24T00:03:00.000Z',
        },
        (await store.getDelivery('delivery-1'))!,
        'accepted',
      ),
    ).resolves.toBeUndefined();
    await expect(store.listAttempts('delivery-1')).resolves.toMatchObject([
      { status: 'unknown' },
    ]);
  });
});

function createBundle(): NotificationLogBundle {
  const createdAt = '2026-08-24T00:00:00.000Z';
  const delivery: NotificationDeliveryRecord = {
    id: 'delivery-1',
    notificationId: 'notification-1',
    channel: 'email',
    recipientKey: 'user-1',
    recipientSnapshot: { address: 'test@example.com' },
    messageSnapshot: { subject: 'Hello' },
    providerChain: ['primary', 'secondary'],
    providerCursor: 0,
    attemptCount: 0,
    status: 'pending',
    idempotencyKey: 'notification-1:delivery-1',
    createdAt,
    updatedAt: createdAt,
    version: 1,
  };
  return {
    log: {
      id: 'notification-1',
      sourceType: 'test',
      messageSnapshot: { email: { subject: 'Hello' } },
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
    },
    deliveries: [delivery],
  };
}

function createAttempt(): NotificationAttemptRecord {
  return {
    id: 'attempt-1',
    deliveryId: 'delivery-1',
    sequence: 1,
    providerName: 'primary',
    providerType: 'fake',
    status: 'submitting',
    startedAt: '2026-08-24T00:00:01.000Z',
  };
}
