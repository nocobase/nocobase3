// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createLoggerManager, createSilentLoggerConfig } from '@nocobase/logger';
import { createQueueManager, createSyncQueueConfig } from '@nocobase/queue';
import { z } from 'zod';
import { createNotificationModule } from '../../registry/notification/server/index.ts';
import { createEmailProviderRegistry, createFakeEmailProvider } from '../../registry/notification/providers/index.ts';
import { createNotificationTemplateRegistry } from '../../registry/notification/templates/index.ts';

const principal = { kind: 'service', serviceId: 'tests' } as const;

describe('notification in-app trigger', () => {
  it('persists and synchronously delivers explicit in-app targets through the queue seam', async () => {
    const queueManager = createQueueManager(createSyncQueueConfig());
    const loggerManager = createLoggerManager(createSilentLoggerConfig());
    const module = createNotificationModule({ allowNonPersistentStore: true, queueManager, logger: loggerManager.use() });

    const result = await module.service.trigger(principal, {
      source: { type: 'test.notification' },
      targets: [{ userId: 'user-1', channels: ['in-app'] }],
      message: { kind: 'content', content: { title: 'Hello', body: 'World', actionUrl: '/inbox' } },
    });

    expect(result.status).toBe('queued');
    await expect(module.service.store.getDelivery(result.deliveries[0].id)).resolves.toMatchObject({ status: 'delivered' });
    await expect(module.service.store.listInbox({ userId: 'user-1' })).resolves.toHaveLength(1);
    await expect(module.service.store.listDeliveryStatusEvents(result.deliveries[0].id)).resolves.toHaveLength(3);

    await module.close({ deadlineAt: Date.now() + 1000 });
    await queueManager.close();
    await loggerManager.flushAll();
  });

  it('rejects duplicate targets before writing a notification', async () => {
    const queueManager = createQueueManager(createSyncQueueConfig());
    const loggerManager = createLoggerManager(createSilentLoggerConfig());
    const module = createNotificationModule({ allowNonPersistentStore: true, queueManager, logger: loggerManager.use() });

    await expect(module.service.trigger(principal, {
      source: { type: 'test.notification' },
      targets: [{ userId: 'user-1', channels: ['in-app'] }, { userId: 'user-1', channels: ['in-app'] }],
      message: { kind: 'content', content: { title: 'Hello', body: 'World' } },
    })).rejects.toMatchObject({ code: 'NOTIFICATION_RECIPIENT_INVALID' });

    await module.close({ deadlineAt: Date.now() + 1000 });
    await queueManager.close();
    await loggerManager.flushAll();
  });

  it('accepts 1000 targets, rejects 1001, and bounds serialized variables', async () => {
    const queueManager = createQueueManager(createSyncQueueConfig());
    const loggerManager = createLoggerManager(createSilentLoggerConfig());
    vi.spyOn(queueManager, 'dispatch').mockRejectedValue(new Error('queue intentionally unavailable'));
    const provider = createFakeEmailProvider({ instanceId: 'email/fake/limit-test' });
    const module = createNotificationModule({
      allowNonPersistentStore: true,
      queueManager,
      logger: loggerManager.use(),
      emailProviders: createEmailProviderRegistry([{ id: provider.instanceId, enabled: true, provider }]),
      resolveUserEmail: async (userId) => `${userId}@example.test`,
    });
    const targets = Array.from({ length: 1000 }, (_, index) => ({
      userId: `user-${index}`,
      channels: ['in-app'] as const,
    }));

    await expect(
      module.service.trigger(principal, {
        source: { type: 'test.notification.limit' },
        targets,
        message: { kind: 'content', content: { title: 'Hello', body: 'World' } },
      }),
    ).resolves.toMatchObject({ deliveries: { length: 1000 } });
    await expect(
      module.service.trigger(principal, {
        source: { type: 'test.notification.delivery-limit' },
        targets: targets.map((target) => ({ ...target, channels: ['in-app', 'email'] as const })),
        message: {
          kind: 'content',
          content: { title: 'Hello', body: 'World', email: { subject: 'Hello', text: 'World' } },
        },
      }),
    ).resolves.toMatchObject({ deliveries: { length: 2000 } });
    await expect(
      module.service.trigger(principal, {
        source: { type: 'test.notification.limit' },
        targets: [...targets, { userId: 'user-over-limit', channels: ['in-app'] }],
        message: { kind: 'content', content: { title: 'Hello', body: 'World' } },
      }),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_TRIGGER_INVALID' });
    await expect(
      module.service.trigger(principal, {
        source: { type: 'test.notification.variables' },
        targets: [{ userId: 'user-variable-limit', channels: ['in-app'], variables: { value: 'x'.repeat(16 * 1024) } }],
        message: { kind: 'content', content: { title: 'Hello', body: 'World' } },
      }),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_VARIABLES_INVALID' });

    await module.close({ deadlineAt: Date.now() + 1000 });
    await queueManager.close();
    await loggerManager.flushAll();
  });

  it('keeps a queued Delivery when queue wake-up publication fails', async () => {
    const queueManager = createQueueManager(createSyncQueueConfig());
    const loggerManager = createLoggerManager(createSilentLoggerConfig());
    vi.spyOn(queueManager, 'dispatch').mockRejectedValueOnce(new Error('queue unavailable'));
    const module = createNotificationModule({ allowNonPersistentStore: true, queueManager, logger: loggerManager.use() });

    const result = await module.service.trigger(principal, { source: { type: 'test.queue-outage' }, targets: [{ userId: 'user-1', channels: ['in-app'] }], message: { kind: 'content', content: { title: 'Hello', body: 'World' } } });

    await expect(module.service.store.getDelivery(result.deliveries[0].id)).resolves.toMatchObject({ status: 'queued' });
    await expect(module.service.store.listDueDeliveries({ now: new Date(Date.now() + 1_000).toISOString(), limit: 10 })).resolves.toMatchObject([{ id: result.deliveries[0].id }]);
    await module.close({ deadlineAt: Date.now() + 1_000 }); await queueManager.close(); await loggerManager.flushAll();
  });

  it('delivers user Email and direct Email targets while only user deliveries enter the Inbox', async () => {
    const queueManager = createQueueManager(createSyncQueueConfig());
    const loggerManager = createLoggerManager(createSilentLoggerConfig());
    const provider = createFakeEmailProvider({ instanceId: 'email/fake/primary' });
    const module = createNotificationModule({ allowNonPersistentStore: true, queueManager, logger: loggerManager.use(),
      emailProviders: createEmailProviderRegistry([{ id: provider.instanceId, enabled: true, provider }]),
      resolveUserEmail: async (userId) => userId === 'user-1' ? 'User@One.Example' : undefined,
    });

    const result = await module.service.trigger(principal, { source: { type: 'test.email' },
      targets: [{ userId: 'user-1', channels: ['email'] }, { kind: 'email', address: 'direct@example.test' }],
      message: { kind: 'content', content: { email: { subject: 'Hello', text: 'World' } } },
    });

    expect(result.deliveries.map((delivery) => delivery.channel)).toEqual(['email', 'email']);
    await expect(module.service.store.getDelivery(result.deliveries[0].id)).resolves.toMatchObject({ status: 'accepted', recipientSnapshot: { email: 'user@one.example' } });
    await expect(module.service.store.listInbox({ userId: 'user-1' })).resolves.toHaveLength(1);
    expect(provider.messages).toHaveLength(2);

    await module.close({ deadlineAt: Date.now() + 1000 }); await queueManager.close(); await loggerManager.flushAll();
  });

  it('renders every recipient before persistence and stores immutable personalized template snapshots', async () => {
    const queueManager = createQueueManager(createSyncQueueConfig());
    const loggerManager = createLoggerManager(createSilentLoggerConfig());
    const templates = createNotificationTemplateRegistry([{ key: 'order.ready', version: '1',
      commonSchema: z.object({ orderId: z.string() }).strict(), recipientSchema: z.object({ name: z.string() }).strict(),
      channels: { inApp: { title: 'Ready for {{ recipient.name }}', body: 'Order {{ common.orderId }}', actionUrl: '/orders/{{ common.orderId }}' } },
    }]);
    const module = createNotificationModule({ allowNonPersistentStore: true, queueManager, logger: loggerManager.use(), templates });

    const result = await module.service.trigger(principal, { source: { type: 'test.template' },
      targets: [{ userId: 'user-1', channels: ['in-app'], variables: { name: 'Ada' } }, { userId: 'user-2', channels: ['in-app'], variables: { name: 'Lin' } }],
      message: { kind: 'template', templateKey: 'order.ready', variables: { orderId: '1001' } },
    });
    const first = await module.service.store.getDelivery(result.deliveries[0].id);
    const second = await module.service.store.getDelivery(result.deliveries[1].id);
    expect(first?.contentSnapshot).toMatchObject({ title: 'Ready for Ada', body: 'Order 1001', actionUrl: '/orders/1001', templateKey: 'order.ready', templateVersion: '1' });
    expect(second?.contentSnapshot).toMatchObject({ title: 'Ready for Lin', body: 'Order 1001', templateKey: 'order.ready', templateVersion: '1' });
    expect(first?.contentSnapshot.templateContentHash).toMatch(/^[a-f0-9]{64}$/);
    createNotificationTemplateRegistry([{ key: 'order.ready', version: '2', commonSchema: z.object({ orderId: z.string() }).strict(), recipientSchema: z.object({ name: z.string() }).strict(), channels: { inApp: { title: 'Changed', body: 'Changed' } } }]);
    await expect(module.service.store.getDelivery(result.deliveries[0].id)).resolves.toMatchObject({ contentSnapshot: { title: 'Ready for Ada', templateVersion: '1' } });

    await expect(module.service.trigger(principal, { source: { type: 'test.template.invalid' },
      targets: [{ userId: 'user-3', channels: ['in-app'], variables: { name: 'Grace' } }, { userId: 'user-4', channels: ['in-app'], variables: {} }],
      message: { kind: 'template', templateKey: 'order.ready', variables: { orderId: '1002' } },
    })).rejects.toThrow();
    await expect(module.service.store.listInbox({ userId: 'user-3' })).resolves.toEqual([]);

    await module.close({ deadlineAt: Date.now() + 1000 }); await queueManager.close(); await loggerManager.flushAll();
  });
});
