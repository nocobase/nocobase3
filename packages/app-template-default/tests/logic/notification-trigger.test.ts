// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createLoggerManager, createSilentLoggerConfig } from '@nocobase/logger';
import { createQueueManager, createSyncQueueConfig } from '@nocobase/queue';
import { createNotificationModule } from '../../registry/notification/server/index.ts';

describe('notification in-app trigger', () => {
  it('persists and synchronously delivers explicit in-app targets through the queue seam', async () => {
    const queueManager = createQueueManager(createSyncQueueConfig());
    const loggerManager = createLoggerManager(createSilentLoggerConfig());
    const module = createNotificationModule({ allowNonPersistentStore: true, queueManager, logger: loggerManager.use() });

    const result = await module.service.trigger({
      principalService: 'tests', source: { type: 'test.notification' },
      targets: [{ userId: 'user-1', channels: ['in-app'] }],
      content: { title: 'Hello', body: 'World', actionUrl: '/inbox' },
    });

    expect(result.status).toBe('queued');
    await expect(module.service.store.getDelivery(result.deliveries[0].id)).resolves.toMatchObject({ status: 'delivered' });
    await expect(module.service.store.listInbox({ userId: 'user-1' })).resolves.toHaveLength(1);
    await expect(module.service.store.listDeliveryStatusEvents(result.deliveries[0].id)).resolves.toHaveLength(2);

    await module.close({ deadlineAt: Date.now() + 1000 });
    await queueManager.close();
    await loggerManager.flushAll();
  });

  it('rejects duplicate targets before writing a notification', async () => {
    const queueManager = createQueueManager(createSyncQueueConfig());
    const loggerManager = createLoggerManager(createSilentLoggerConfig());
    const module = createNotificationModule({ allowNonPersistentStore: true, queueManager, logger: loggerManager.use() });

    await expect(module.service.trigger({
      principalService: 'tests', source: { type: 'test.notification' },
      targets: [{ userId: 'user-1', channels: ['in-app'] }, { userId: 'user-1', channels: ['in-app'] }],
      content: { title: 'Hello', body: 'World' },
    })).rejects.toMatchObject({ code: 'NOTIFICATION_RECIPIENT_INVALID' });

    await module.close({ deadlineAt: Date.now() + 1000 });
    await queueManager.close();
    await loggerManager.flushAll();
  });
});
