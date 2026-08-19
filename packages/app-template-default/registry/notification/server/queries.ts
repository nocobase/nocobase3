import type { DeliveryAttemptRecord, DeliveryStatusEventRecord, NotificationStore } from './domain.js';

export interface DeliveryDetailDto {
  readonly id: string;
  readonly notificationId: string;
  readonly channel: 'in-app' | 'email';
  readonly status: string;
  readonly recipient: { readonly kind?: 'user' | 'email'; readonly userId?: string; readonly email?: string };
  readonly content: Record<string, unknown>;
  readonly providerChain: readonly string[];
  readonly providerCursor: number;
  readonly attempts: readonly DeliveryAttemptDto[];
  readonly events: readonly DeliveryStatusEventDto[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DeliveryAttemptDto {
  readonly id: string;
  readonly sequence: number;
  readonly providerInstance: string;
  readonly providerType: string;
  readonly configRevision?: string;
  readonly status: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly providerMessageId?: string;
  readonly error?: { readonly category?: string; readonly code?: string; readonly message?: string };
}

export interface DeliveryStatusEventDto {
  readonly sequence: number;
  readonly fromStatus?: string;
  readonly toStatus: string;
  readonly attemptId?: string;
  readonly reason?: string;
  readonly occurredAt: string;
}

export async function getDeliveryDetail(store: NotificationStore, deliveryId: string): Promise<DeliveryDetailDto | undefined> {
  const delivery = await store.getDelivery(deliveryId);
  if (!delivery) return undefined;
  const [attempts, events] = await Promise.all([store.listDeliveryAttempts(deliveryId), store.listDeliveryStatusEvents(deliveryId)]);
  return {
    id: delivery.id, notificationId: delivery.notificationId, channel: delivery.channel, status: delivery.status,
    recipient: redactRecipient(delivery.recipientSnapshot), content: structuredClone(delivery.contentSnapshot),
    providerChain: [...delivery.providerChainSnapshot], providerCursor: delivery.providerCursor,
    attempts: attempts.map(toAttemptDto), events: events.map(toEventDto), createdAt: delivery.createdAt, updatedAt: delivery.updatedAt,
  };
}

function redactRecipient(snapshot: Record<string, unknown>): DeliveryDetailDto['recipient'] {
  const kind = snapshot.kind === 'user' || snapshot.kind === 'email' ? snapshot.kind : undefined;
  return { kind, userId: typeof snapshot.userId === 'string' ? snapshot.userId : undefined, email: typeof snapshot.email === 'string' ? maskEmail(snapshot.email) : undefined };
}

function toAttemptDto(attempt: DeliveryAttemptRecord): DeliveryAttemptDto {
  const message = attempt.errorMessage ? redactText(attempt.errorMessage) : undefined;
  return { id: attempt.id, sequence: attempt.attemptSequence, providerInstance: attempt.providerInstance, providerType: attempt.providerType, configRevision: attempt.configRevision, status: attempt.status, startedAt: attempt.startedAt, finishedAt: attempt.finishedAt, providerMessageId: attempt.providerMessageId,
    error: attempt.errorCategory || attempt.errorCode || message ? { category: attempt.errorCategory, code: attempt.errorCode, message } : undefined };
}

function toEventDto(event: DeliveryStatusEventRecord): DeliveryStatusEventDto {
  return { sequence: event.sequence, fromStatus: event.fromStatus, toStatus: event.toStatus, attemptId: event.attemptId, reason: event.reason, occurredAt: event.occurredAt };
}

function maskEmail(address: string): string {
  const [local = '', domain = ''] = address.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

function redactText(value: string): string {
  return value.replace(/[\w.+-]+@[\w.-]+/g, '[redacted-email]').slice(0, 500);
}
