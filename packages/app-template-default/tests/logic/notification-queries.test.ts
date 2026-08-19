// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createMemoryNotificationStore } from '../../registry/notification/server/domain.ts';
import { getDeliveryDetail } from '../../registry/notification/server/queries.ts';

describe('notification delivery query DTO', () => {
  it('masks recipient addresses and redacts provider errors', async () => {
    const store = createMemoryNotificationStore();
    const time = '2026-08-19T00:00:00.000Z';
    await store.createNotificationBundle({ notification: { id: 'n1', sourceType: 'test', principalService: 'tests', triggeredAt: time, messageMode: 'direct', summaryStatus: 'queued', version: 1, createdAt: time, updatedAt: time }, deliveries: [{ id: 'd1', notificationId: 'n1', channel: 'email', recipientKey: 'email:secret@example.test', recipientSnapshot: { kind: 'email', email: 'secret@example.test' }, recipientSchemaVersion: 1, contentSnapshot: { subject: 'Hello', text: 'World' }, contentSchemaVersion: 1, providerChainSnapshot: ['email/smtp/primary'], providerChainSchemaVersion: 1, providerCursor: 0, currentAttempt: 0, status: 'queued', statusChangedAt: time, version: 1, createdAt: time, updatedAt: time }] });
    const claimed = await store.claimDelivery({ deliveryId: 'd1', expectedVersion: 1, leaseToken: 'lease', leaseOwner: 'worker', leaseExpiresAt: time, claimedAt: time, attempt: { id: 'a1', deliveryId: 'd1', attemptSequence: 1, providerInstance: 'email/smtp/primary', providerType: 'smtp', configRevision: 'rev', status: 'sending', startedAt: time, metadataSchemaVersion: 1, createdAt: time, updatedAt: time } });
    await store.transitionDelivery({ deliveryId: 'd1', expectedVersion: claimed!.version, fromStatus: 'sending', toStatus: 'failed', statusChangedAt: time, attempt: { id: 'a1', deliveryId: 'd1', attemptSequence: 1, providerInstance: 'email/smtp/primary', providerType: 'smtp', configRevision: 'rev', status: 'failed', startedAt: time, finishedAt: time, errorMessage: 'Rejected secret@example.test', metadataSchemaVersion: 1, createdAt: time, updatedAt: time } });

    const detail = await getDeliveryDetail(store, 'd1');
    expect(detail).toMatchObject({ recipient: { email: 's***@example.test' }, attempts: [{ error: { message: 'Rejected [redacted-email]' } }] });
    expect(JSON.stringify(detail)).not.toContain('secret@example.test');
  });
});
