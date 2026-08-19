// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createEmailProviderRegistry, createFakeEmailProvider } from '../../registry/notification/providers/index.ts';
import { createMemoryNotificationStore, type DeliveryRecord, type NotificationRecord } from '../../registry/notification/server/domain.ts';
import { dispatchEmailDelivery } from '../../registry/notification/server/email-dispatcher.ts';

describe('notification email dispatcher', () => {
  it('records SMTP-style acceptance without claiming delivery', async () => {
    const store = await createEmailStore(['email/fake/primary']);
    const provider = createFakeEmailProvider({ instanceId: 'email/fake/primary', outcomes: [{ status: 'accepted', providerMessageId: 'provider-1' }] });
    const registry = createEmailProviderRegistry([{ id: provider.instanceId, enabled: true, provider }]);

    const result = await dispatchEmailDelivery({ store, providers: registry, deliveryId: 'delivery-1', workerId: 'worker-1', now: () => new Date('2026-08-19T00:00:01.000Z') });

    expect(result).toMatchObject({ status: 'accepted' });
    await expect(store.listDeliveryAttempts('delivery-1')).resolves.toMatchObject([{ status: 'accepted', providerMessageId: 'provider-1' }]);
    await expect(store.listInbox({ userId: 'user-1' })).resolves.toHaveLength(1);
  });

  it('retries a transient failure three times before falling back in fixed order', async () => {
    const store = await createEmailStore(['email/fake/primary', 'email/fake/backup']);
    const transient = { status: 'failed' as const, error: { category: 'network' as const, code: 'TEMPORARY', message: 'Temporary failure.', retryable: true, allowFallback: true } };
    const primary = createFakeEmailProvider({ instanceId: 'email/fake/primary', outcomes: [transient, transient, transient] });
    const backup = createFakeEmailProvider({ instanceId: 'email/fake/backup' });
    const registry = createEmailProviderRegistry([{ id: primary.instanceId, enabled: true, provider: primary }, { id: backup.instanceId, enabled: true, provider: backup }]);
    let current = new Date('2026-08-19T00:00:01.000Z');
    const dispatch = () => dispatchEmailDelivery({ store, providers: registry, deliveryId: 'delivery-1', workerId: 'worker-1', now: () => current });

    await dispatch();
    current = new Date('2026-08-19T00:00:31.000Z'); await dispatch();
    current = new Date('2026-08-19T00:02:31.000Z'); await dispatch();
    await dispatch();

    await expect(store.getDelivery('delivery-1')).resolves.toMatchObject({ status: 'accepted', providerCursor: 1 });
    expect(primary.messages).toHaveLength(3);
    expect(backup.messages).toHaveLength(1);
    await expect(store.listDeliveryAttempts('delivery-1')).resolves.toHaveLength(4);
  });

  it('stops automatic processing when submission is unknown', async () => {
    const store = await createEmailStore(['email/fake/primary']);
    const provider = createFakeEmailProvider({ instanceId: 'email/fake/primary', outcomes: [{ status: 'submission_unknown', error: { category: 'network', code: 'UNKNOWN', message: 'Unknown.' } }] });
    const registry = createEmailProviderRegistry([{ id: provider.instanceId, enabled: true, provider }]);
    await dispatchEmailDelivery({ store, providers: registry, deliveryId: 'delivery-1', workerId: 'worker-1', now: () => new Date('2026-08-19T00:00:01.000Z') });
    await expect(store.getDelivery('delivery-1')).resolves.toMatchObject({ status: 'submission_unknown' });
    await dispatchEmailDelivery({ store, providers: registry, deliveryId: 'delivery-1', workerId: 'worker-1' });
    expect(provider.messages).toHaveLength(1);
  });
});

async function createEmailStore(providerChainSnapshot: readonly string[]) {
  const store = createMemoryNotificationStore();
  const notification: NotificationRecord = { id: 'notification-1', sourceType: 'test', principalService: 'tests', triggeredAt: '2026-08-19T00:00:00.000Z', messageMode: 'direct', summaryStatus: 'queued', version: 1, createdAt: '2026-08-19T00:00:00.000Z', updatedAt: '2026-08-19T00:00:00.000Z' };
  const delivery: DeliveryRecord = { id: 'delivery-1', notificationId: notification.id, channel: 'email', recipientKey: 'user:user-1', recipientSnapshot: { kind: 'user', userId: 'user-1', email: 'user@example.test' }, recipientSchemaVersion: 1, contentSnapshot: { messageId: '<notification-1@example.test>', subject: 'Hello', text: 'World' }, contentSchemaVersion: 1, providerChainSnapshot, providerChainSchemaVersion: 1, providerCursor: 0, currentAttempt: 0, status: 'queued', statusChangedAt: notification.createdAt, version: 1, createdAt: notification.createdAt, updatedAt: notification.createdAt };
  await store.createNotificationBundle({ notification, deliveries: [delivery], userNotificationItems: [{ id: 'item-1', deliveryId: delivery.id, notificationId: notification.id, userId: 'user-1', channel: 'email', createdAt: notification.createdAt, updatedAt: notification.createdAt, version: 1 }] });
  return store;
}
