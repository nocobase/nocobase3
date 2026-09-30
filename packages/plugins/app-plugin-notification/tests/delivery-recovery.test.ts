import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { DatabaseManager } from '@nocobase/db';
import { createJobExecutorService, type Job } from '@nocobase/jobs';
import { createLogger } from '@nocobase/logging';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createNotificationManager } from '../server/manager.js';
import { createDatabaseNotificationStore } from '../server/store.js';
import { createNotificationTestDatabase } from './helpers/database.js';

let storagePath: string;
let database: DatabaseManager;

beforeEach(async () => {
  storagePath = await mkdtemp(path.join(tmpdir(), 'notification-recovery-'));
  database = await createNotificationTestDatabase();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await database.destroy();
  await rm(storagePath, { recursive: true, force: true });
});

it('reconciles a Delivery whose enqueue failed and ignores a second task for the accepted Delivery', async () => {
  // Control only the reconciler's interval: the memory jobs backend keeps real timers.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const service = createJobExecutorService(undefined, {
    appName: 'notification-recovery',
    storagePath,
  });
  const executor = service.getJobExecutor('@nocobase/app-plugin-notification');
  const store = createDatabaseNotificationStore(database);
  const send = vi.fn(async () => ({ status: 'accepted' }) as const);
  const manager = createNotificationManager({
    database,
    executor,
    store,
    logger: createLogger({ level: 'silent' }),
    reconcileIntervalMs: 1_000,
    config: { channels: { email: { provider: 'fake' } } },
  });
  manager.registry
    .registerChannel({
      type: 'email',
      async createChannel() {
        return {
          type: 'email',
          validateMessage(message: object) {
            return { message, recipients: [{ address: 'buyer@example.com' }] };
          },
          async prepare({ message }): Promise<object> {
            return message;
          },
        };
      },
    })
    .registerProvider({
      type: 'fake',
      messageType: 'email',
      async createProvider(_context, config) {
        return { type: config.provider, send };
      },
    });
  const enqueueError = new Error('First notification enqueue failed');
  const addJob = vi
    .spyOn(executor, 'addJob')
    .mockRejectedValueOnce(enqueueError);
  const listReady = vi.spyOn(store, 'listReady');

  try {
    await manager.start();
    expect(listReady).toHaveBeenCalledOnce();
    listReady.mockClear();
    const result = await manager.send({
      idempotencyKey: 'notification-enqueue-recovery',
      messages: { email: { body: 'Recover this persisted delivery.' } },
    });
    expect(result.deliveries).toHaveLength(1);
    const deliveryId = result.deliveries[0]!.id;
    expect(addJob).toHaveBeenCalledOnce();
    expect(addJob.mock.calls[0]![0].payload).toEqual({ deliveryId });
    expect(listReady).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();

    // Read through a fresh production store, not the send result or a mock cache.
    const persisted = createDatabaseNotificationStore(database);
    await expect(persisted.getDelivery(deliveryId)).resolves.toMatchObject({
      id: deliveryId,
      notificationId: result.notificationId,
      status: 'pending',
      attemptCount: 0,
    });
    await expect(persisted.listAttempts(deliveryId)).resolves.toEqual([]);

    // Run the manager-owned periodic reconciler, without another send or retry.
    await vi.advanceTimersByTimeAsync(1_000);
    await expect
      .poll(() => manager.getNotification(result.notificationId))
      .toMatchObject({
        status: 'completed',
        terminal: true,
        summary: { total: 1, accepted: 1, pending: 0 },
      });
    expect(listReady).toHaveBeenCalledOnce();
    expect(addJob).toHaveBeenCalledTimes(2);
    expect(addJob.mock.calls[1]![0].payload).toEqual({ deliveryId });
    const accepted = await persisted.getDelivery(deliveryId);
    expect(accepted).toMatchObject({ status: 'accepted', attemptCount: 1 });
    const attempts = await persisted.listAttempts(deliveryId);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ sequence: 1, status: 'accepted' });
    expect(send).toHaveBeenCalledOnce();

    // A task can run again after recovery; the handler must not send twice.
    const recovered = addJob.mock.calls[1]![0] as Job<{ deliveryId: string }>;
    const DeliveryJob = recovered.constructor as new (payload: {
      deliveryId: string;
    }) => Job<{ deliveryId: string }>;
    const deliveryRead = vi.spyOn(store, 'getDelivery');
    await executor.addJob(new DeliveryJob({ deliveryId }));
    await expect.poll(() => deliveryRead.mock.calls).toEqual([[deliveryId]]);
    // Closing waits for the running task, not just its acceptance.
    await manager.close();
    expect(send).toHaveBeenCalledOnce();
    await expect(persisted.getDelivery(deliveryId)).resolves.toEqual(accepted);
    await expect(persisted.listAttempts(deliveryId)).resolves.toEqual(attempts);
  } finally {
    await manager.close();
    await service.shutdown();
  }
});
