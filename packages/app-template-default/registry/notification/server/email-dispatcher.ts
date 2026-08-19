import { randomUUID } from 'node:crypto';

import type { EmailProviderMessage, EmailProviderRegistry, ProviderError, ProviderSendResult } from '../providers/index.js';
import type { DeliveryAttemptRecord, DeliveryRecord, DeliveryStatusEventRecord, NotificationStatus, NotificationStore } from './domain.js';

export interface EmailDispatchOptions {
  readonly store: NotificationStore;
  readonly providers: EmailProviderRegistry;
  readonly deliveryId: string;
  readonly workerId: string;
  readonly now?: () => Date;
}

export async function dispatchEmailDelivery(options: EmailDispatchOptions): Promise<DeliveryRecord | undefined> {
  const delivery = await options.store.getDelivery(options.deliveryId);
  if (!delivery || delivery.channel !== 'email' || delivery.status !== 'queued') return delivery;
  const startedAt = await resolveDispatchTime(options);
  if (delivery.nextRunAt && delivery.nextRunAt > startedAt.toISOString()) return delivery;
  const selected = selectProvider(delivery, options.providers);
  if (!selected) return finishWithoutProvider(options.store, delivery, startedAt);
  const occurredAt = startedAt.toISOString();
  const events = await options.store.listDeliveryStatusEvents(delivery.id);
  const attemptId = randomUUID();
  const attemptSequence = (await options.store.listDeliveryAttempts(delivery.id)).length + 1;
  const attempt: DeliveryAttemptRecord = {
    id: attemptId, deliveryId: delivery.id, attemptSequence, providerInstance: selected.provider.instanceId,
    providerType: selected.provider.providerType, configRevision: selected.provider.configRevision, status: 'sending',
    startedAt: occurredAt, invocationStartedAt: occurredAt, metadataSchemaVersion: 1, createdAt: occurredAt, updatedAt: occurredAt,
  };
  const sending = await options.store.claimDelivery({
    deliveryId: delivery.id, expectedVersion: delivery.version, leaseToken: randomUUID(), leaseOwner: options.workerId,
    leaseExpiresAt: new Date(startedAt.getTime() + 30_000).toISOString(), claimedAt: occurredAt, attempt,
    event: statusEvent(delivery, events.length + 1, 'sending', occurredAt, attemptId),
  });
  if (!sending) return undefined;
  const result = await selected.provider.send(toEmailMessage(delivery));
  return applyProviderResult(options.store, sending, attempt, result, selected.cursor, options.providers, events.length + 2, await resolveDispatchTime(options));
}

async function resolveDispatchTime(options: EmailDispatchOptions): Promise<Date> {
  return options.now?.() ?? new Date(await options.store.now());
}

function selectProvider(delivery: DeliveryRecord, providers: EmailProviderRegistry) {
  for (let cursor = delivery.providerCursor; cursor < delivery.providerChainSnapshot.length; cursor += 1) {
    const instance = providers.get(delivery.providerChainSnapshot[cursor]);
    if (instance?.enabled) return { provider: instance.provider, cursor };
  }
  return undefined;
}

async function applyProviderResult(store: NotificationStore, delivery: DeliveryRecord, attempt: DeliveryAttemptRecord, result: ProviderSendResult, cursor: number, providers: EmailProviderRegistry, sequence: number, time: Date): Promise<DeliveryRecord | undefined> {
  const changedAt = time.toISOString();
  if (result.status === 'accepted') return store.transitionDelivery({ deliveryId: delivery.id, expectedVersion: delivery.version, fromStatus: 'sending', toStatus: 'accepted', statusChangedAt: changedAt, leaseToken: delivery.leaseToken, clearLease: true, clearNextRunAt: true,
    attempt: { ...attempt, status: 'accepted', finishedAt: changedAt, providerMessageId: result.providerMessageId, metadata: result.metadata, updatedAt: changedAt },
    event: statusEvent(delivery, sequence, 'accepted', changedAt, attempt.id), });
  if (result.status === 'submission_unknown') return store.transitionDelivery({ deliveryId: delivery.id, expectedVersion: delivery.version, fromStatus: 'sending', toStatus: 'submission_unknown', statusChangedAt: changedAt, leaseToken: delivery.leaseToken, clearLease: true,
    lastError: { ...result.error }, attempt: failedAttempt(attempt, 'submission_unknown', result.error, changedAt), event: statusEvent(delivery, sequence, 'submission_unknown', changedAt, attempt.id), });
  const nextAttempt = delivery.currentAttempt + 1;
  const hasFallback = hasEnabledProviderAfter(delivery, providers, cursor);
  if (result.error.retryable && nextAttempt < 3) {
    const delayMs = nextAttempt === 1 ? 30_000 : 120_000;
    return store.transitionDelivery({ deliveryId: delivery.id, expectedVersion: delivery.version, fromStatus: 'sending', toStatus: 'queued', statusChangedAt: changedAt, leaseToken: delivery.leaseToken, clearLease: true, currentAttempt: nextAttempt, providerCursor: cursor, nextRunAt: new Date(time.getTime() + delayMs).toISOString(), lastError: { ...result.error },
      attempt: failedAttempt(attempt, 'failed', result.error, changedAt), event: statusEvent(delivery, sequence, 'queued', changedAt, attempt.id), });
  }
  if (result.error.allowFallback && hasFallback) return store.transitionDelivery({ deliveryId: delivery.id, expectedVersion: delivery.version, fromStatus: 'sending', toStatus: 'queued', statusChangedAt: changedAt, leaseToken: delivery.leaseToken, clearLease: true, clearNextRunAt: true, currentAttempt: 0, providerCursor: cursor + 1, lastError: { ...result.error },
    attempt: failedAttempt(attempt, 'failed', result.error, changedAt), event: statusEvent(delivery, sequence, 'queued', changedAt, attempt.id), });
  return store.transitionDelivery({ deliveryId: delivery.id, expectedVersion: delivery.version, fromStatus: 'sending', toStatus: 'failed', statusChangedAt: changedAt, leaseToken: delivery.leaseToken, clearLease: true, clearNextRunAt: true, currentAttempt: nextAttempt, providerCursor: cursor, lastError: { ...result.error },
    attempt: failedAttempt(attempt, 'failed', result.error, changedAt), event: statusEvent(delivery, sequence, 'failed', changedAt, attempt.id), });
}

async function finishWithoutProvider(store: NotificationStore, delivery: DeliveryRecord, time: Date): Promise<DeliveryRecord | undefined> {
  const changedAt = time.toISOString();
  const events = await store.listDeliveryStatusEvents(delivery.id);
  return store.transitionDelivery({ deliveryId: delivery.id, expectedVersion: delivery.version, fromStatus: 'queued', toStatus: 'failed', statusChangedAt: changedAt,
    lastError: { category: 'provider_unavailable', code: 'NO_AVAILABLE_PROVIDER', message: 'No configured email provider is available.' },
    event: statusEvent(delivery, events.length + 1, 'failed', changedAt), });
}

function toEmailMessage(delivery: DeliveryRecord): EmailProviderMessage {
  const recipient = delivery.recipientSnapshot.email;
  const { subject, text, html, messageId } = delivery.contentSnapshot;
  if (typeof recipient !== 'string' || typeof subject !== 'string' || typeof text !== 'string' || typeof messageId !== 'string' || (html !== undefined && typeof html !== 'string')) throw new Error('Email delivery snapshot is invalid.');
  return { to: recipient, subject, text, messageId, html };
}

function hasEnabledProviderAfter(delivery: DeliveryRecord, providers: EmailProviderRegistry, cursor: number): boolean {
  return delivery.providerChainSnapshot.slice(cursor + 1).some((id) => providers.get(id)?.enabled);
}

function failedAttempt(attempt: DeliveryAttemptRecord, status: 'failed' | 'submission_unknown', error: ProviderError | Omit<ProviderError, 'retryable' | 'allowFallback'>, changedAt: string): DeliveryAttemptRecord {
  return { ...attempt, status, finishedAt: changedAt, errorCategory: error.category, errorCode: error.code, errorMessage: error.message, updatedAt: changedAt };
}

function statusEvent(delivery: DeliveryRecord, sequence: number, toStatus: NotificationStatus, occurredAt: string, attemptId?: string): DeliveryStatusEventRecord {
  return { id: randomUUID(), deliveryId: delivery.id, sequence, fromStatus: delivery.status, toStatus, attemptId, occurredAt, metadataSchemaVersion: 1 };
}
