import type { DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DatabaseNotificationStore,
  type NotificationAttemptRecord,
  type NotificationDeliveryRecord,
  type NotificationLogBundle,
} from '../server/store.js';
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
        providerName: 'primary',
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
    expect(started).toMatchObject({ attemptCount: 1 });
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

  it('does not claim a retry before nextRunAt', async () => {
    await store.create(createBundle());
    const claimed = await store.claimDelivery(
      'delivery-1',
      'lease-1',
      '2026-08-25T00:01:00.000Z',
    );
    const attempt = createAttempt();
    const started = await store.startAttempt(
      claimed!,
      attempt,
      '2026-08-25T00:01:00.000Z',
    );
    await store.finishAttemptAndDelivery(
      {
        ...attempt,
        status: 'failed',
        finishedAt: '2026-08-25T00:00:01.000Z',
        error: { message: 'retry later' },
      },
      started!,
      'failed',
      { message: 'retry later' },
      '2099-01-01T00:00:00.000Z',
    );

    await expect(
      store.claimDelivery('delivery-1', 'lease-2', '2026-08-25T00:02:00.000Z'),
    ).resolves.toBeUndefined();
  });

  it('derives notification status from current Delivery states', async () => {
    const bundle = createBundle();
    await store.create({
      ...bundle,
      deliveries: [
        ...bundle.deliveries,
        { ...bundle.deliveries[0]!, id: 'delivery-2' },
      ],
    });
    const first = await store.claimDelivery(
      'delivery-1',
      'lease-1',
      '2026-08-25T00:01:00.000Z',
    );
    const firstAttempt = createAttempt();
    const firstStarted = await store.startAttempt(
      first!,
      firstAttempt,
      '2026-08-25T00:01:00.000Z',
    );
    await store.finishAttemptAndDelivery(
      {
        ...firstAttempt,
        status: 'accepted',
        finishedAt: '2026-08-25T00:00:01.000Z',
      },
      firstStarted!,
      'accepted',
    );
    await expect(store.getLog('notification-1')).resolves.toMatchObject({
      status: 'processing',
    });

    const second = await store.claimDelivery(
      'delivery-2',
      'lease-2',
      '2026-08-25T00:01:00.000Z',
    );
    const secondAttempt = {
      ...createAttempt(),
      id: 'attempt-2',
      deliveryId: 'delivery-2',
    };
    const secondStarted = await store.startAttempt(
      second!,
      secondAttempt,
      '2026-08-25T00:01:00.000Z',
    );
    await store.finishAttemptAndDelivery(
      {
        ...secondAttempt,
        status: 'accepted',
        finishedAt: '2026-08-25T00:00:02.000Z',
      },
      secondStarted!,
      'accepted',
    );
    await expect(store.getLog('notification-1')).resolves.toMatchObject({
      status: 'completed',
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
    recipientSnapshot: { address: 'test@example.com' },
    messageSnapshot: { subject: 'Hello' },
    providerName: 'primary',
    providerType: 'fake',
    attemptCount: 0,
    status: 'pending',
    createdAt,
    updatedAt: createdAt,
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
