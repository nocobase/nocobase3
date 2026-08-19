import { randomUUID } from "node:crypto";

import type {
  DeliveryAttemptRecord,
  DeliveryListQuery,
  DeliveryRecord,
  DeliveryStatusEventRecord,
  NotificationChannel,
  NotificationStatus,
  NotificationStore,
} from "./domain.js";

export interface DeliveryListInput {
  readonly status?: NotificationStatus;
  readonly channel?: NotificationChannel;
  readonly search?: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface DeliveryListItemDto {
  readonly id: string;
  readonly notificationId: string;
  readonly channel: NotificationChannel;
  readonly status: NotificationStatus;
  readonly version: number;
  readonly recipient: string;
  readonly provider?: string;
  readonly attemptCount: number;
  readonly lastError?: {
    readonly category?: string;
    readonly code?: string;
    readonly message?: string;
  };
  readonly source: { readonly type: string; readonly referenceId?: string };
  readonly updatedAt: string;
}

export interface DeliveryListDto {
  readonly data: readonly DeliveryListItemDto[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface DeliveryDetailDto {
  readonly id: string;
  readonly notificationId: string;
  readonly channel: NotificationChannel;
  readonly status: NotificationStatus;
  readonly version: number;
  readonly recipient: {
    readonly kind?: "user" | "email";
    readonly userId?: string;
    readonly email?: string;
  };
  readonly content: DeliveryContentSummaryDto;
  readonly source: {
    readonly type: string;
    readonly referenceId?: string;
    readonly principalService: string;
  };
  readonly providerChain: readonly string[];
  readonly providerCursor: number;
  readonly attempts: readonly DeliveryAttemptDto[];
  readonly events: readonly DeliveryStatusEventDto[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DeliveryContentSummaryDto {
  readonly schemaVersion: number;
  readonly fields: readonly string[];
  readonly byteLengths: Readonly<Record<string, number>>;
  readonly templateKey?: string;
  readonly templateVersion?: string;
  readonly templateContentHash?: string;
  readonly messageId?: string;
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
  readonly error?: {
    readonly category?: string;
    readonly code?: string;
    readonly message?: string;
  };
}

export interface DeliveryStatusEventDto {
  readonly sequence: number;
  readonly fromStatus?: string;
  readonly toStatus: string;
  readonly attemptId?: string;
  readonly reason?: string;
  readonly actor?: string;
  readonly occurredAt: string;
}

export interface RetryDeliveryInput {
  readonly deliveryId: string;
  readonly expectedVersion: number;
  readonly reason: string;
  readonly acknowledgeDuplicateRisk?: boolean;
  readonly actor: string;
  readonly changedAt?: string;
}

export class NotificationAdminError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: 400 | 404 | 409,
    message: string
  ) {
    super(message);
    this.name = "NotificationAdminError";
  }
}

export async function listDeliverySummaries(
  store: NotificationStore,
  input: DeliveryListInput
): Promise<DeliveryListDto> {
  const query: DeliveryListQuery = {
    status: input.status,
    channel: input.channel,
    search: input.search,
    page: input.page,
    pageSize: input.pageSize,
  };
  const [deliveries, total] = await Promise.all([
    store.listDeliveries(query),
    store.countDeliveries(query),
  ]);
  const data = await Promise.all(
    deliveries.map(async (delivery): Promise<DeliveryListItemDto> => {
      const [notification, attempts] = await Promise.all([
        store.getNotification(delivery.notificationId),
        store.listDeliveryAttempts(delivery.id),
      ]);
      const lastAttempt = attempts.at(-1);
      return {
        id: delivery.id,
        notificationId: delivery.notificationId,
        channel: delivery.channel,
        status: delivery.status,
        version: delivery.version,
        recipient: redactRecipientLabel(delivery),
        provider:
          lastAttempt?.providerInstance ??
          delivery.providerChainSnapshot[delivery.providerCursor],
        attemptCount: attempts.length,
        lastError: redactError(delivery.lastError, lastAttempt),
        source: {
          type: notification?.sourceType ?? "unknown",
          referenceId: notification?.sourceReferenceId,
        },
        updatedAt: delivery.updatedAt,
      };
    })
  );
  return { data, page: input.page, pageSize: input.pageSize, total };
}

export async function getDeliveryDetail(
  store: NotificationStore,
  deliveryId: string
): Promise<DeliveryDetailDto | undefined> {
  const delivery = await store.getDelivery(deliveryId);
  if (!delivery) return undefined;
  const [notification, attempts, events] = await Promise.all([
    store.getNotification(delivery.notificationId),
    store.listDeliveryAttempts(deliveryId),
    store.listDeliveryStatusEvents(deliveryId),
  ]);
  return {
    id: delivery.id,
    notificationId: delivery.notificationId,
    channel: delivery.channel,
    status: delivery.status,
    version: delivery.version,
    recipient: redactRecipient(delivery.recipientSnapshot),
    content: summarizeContent(delivery),
    source: {
      type: notification?.sourceType ?? "unknown",
      referenceId: notification?.sourceReferenceId,
      principalService: notification?.principalService ?? "unknown",
    },
    providerChain: [...delivery.providerChainSnapshot],
    providerCursor: delivery.providerCursor,
    attempts: attempts.map(toAttemptDto),
    events: events.map(toEventDto),
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
  };
}

export async function retryDelivery(
  store: NotificationStore,
  input: RetryDeliveryInput
): Promise<DeliveryRecord> {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500)
    throw new NotificationAdminError(
      "NOTIFICATION_RETRY_REASON_INVALID",
      400,
      "A retry reason between 3 and 500 characters is required."
    );
  const delivery = await store.getDelivery(input.deliveryId);
  if (!delivery)
    throw new NotificationAdminError(
      "NOTIFICATION_DELIVERY_NOT_FOUND",
      404,
      "Delivery not found."
    );
  if (delivery.status !== "failed" && delivery.status !== "submission_unknown")
    throw new NotificationAdminError(
      "NOTIFICATION_DELIVERY_NOT_RETRYABLE",
      409,
      "Delivery is not retryable."
    );
  if (
    delivery.status === "submission_unknown" &&
    input.acknowledgeDuplicateRisk !== true
  )
    throw new NotificationAdminError(
      "NOTIFICATION_DUPLICATE_RISK_ACK_REQUIRED",
      400,
      "Retrying an uncertain submission requires duplicate-risk acknowledgement."
    );
  const events = await store.listDeliveryStatusEvents(delivery.id);
  const changedAt = input.changedAt ?? new Date().toISOString();
  const result = await store.transitionDelivery({
    deliveryId: delivery.id,
    expectedVersion: input.expectedVersion,
    fromStatus: delivery.status,
    toStatus: "queued",
    statusChangedAt: changedAt,
    clearLastError: true,
    clearNextRunAt: true,
    clearLease: true,
    providerCursor: 0,
    currentAttempt: 0,
    event: {
      id: randomUUID(),
      deliveryId: delivery.id,
      sequence: events.length + 1,
      fromStatus: delivery.status,
      toStatus: "queued",
      reason,
      actor: input.actor,
      occurredAt: changedAt,
      metadata: {
        operation: "manual_retry",
        duplicateRiskAcknowledged: input.acknowledgeDuplicateRisk === true,
      },
      metadataSchemaVersion: 1,
    },
  });
  if (!result)
    throw new NotificationAdminError(
      "NOTIFICATION_DELIVERY_RETRY_CONFLICT",
      409,
      "Delivery changed before retry could be applied."
    );
  return result;
}

function summarizeContent(delivery: DeliveryRecord): DeliveryContentSummaryDto {
  const snapshot = delivery.contentSnapshot;
  const sensitiveFields = new Set(["html", "body", "text", "subject", "title"]);
  const byteLengths: Record<string, number> = {};
  for (const [key, value] of Object.entries(snapshot))
    if (typeof value === "string" && sensitiveFields.has(key))
      byteLengths[key] = Buffer.byteLength(value, "utf8");
  return {
    schemaVersion: delivery.contentSchemaVersion,
    fields: Object.keys(snapshot).sort(),
    byteLengths,
    templateKey: stringValue(snapshot.templateKey),
    templateVersion: stringValue(snapshot.templateVersion),
    templateContentHash: stringValue(snapshot.templateContentHash),
    messageId: stringValue(snapshot.messageId),
  };
}

function redactRecipientLabel(delivery: DeliveryRecord): string {
  const email = stringValue(delivery.recipientSnapshot.email);
  const userId = stringValue(delivery.recipientSnapshot.userId);
  return email
    ? maskEmail(email)
    : userId
    ? maskIdentifier(userId)
    : maskIdentifier(delivery.recipientKey);
}

function redactRecipient(
  snapshot: Record<string, unknown>
): DeliveryDetailDto["recipient"] {
  const kind =
    snapshot.kind === "user" || snapshot.kind === "email"
      ? snapshot.kind
      : undefined;
  const userId = stringValue(snapshot.userId);
  const email = stringValue(snapshot.email);
  return {
    kind,
    userId: userId ? maskIdentifier(userId) : undefined,
    email: email ? maskEmail(email) : undefined,
  };
}

function redactError(
  lastError: Record<string, unknown> | undefined,
  attempt?: DeliveryAttemptRecord
): DeliveryListItemDto["lastError"] {
  const category = attempt?.errorCategory ?? stringValue(lastError?.category);
  const code = attempt?.errorCode ?? stringValue(lastError?.code);
  const rawMessage = attempt?.errorMessage ?? stringValue(lastError?.message);
  return category || code || rawMessage
    ? {
        category,
        code,
        message: rawMessage ? redactText(rawMessage) : undefined,
      }
    : undefined;
}

function toAttemptDto(attempt: DeliveryAttemptRecord): DeliveryAttemptDto {
  const message = attempt.errorMessage
    ? redactText(attempt.errorMessage)
    : undefined;
  return {
    id: attempt.id,
    sequence: attempt.attemptSequence,
    providerInstance: attempt.providerInstance,
    providerType: attempt.providerType,
    configRevision: attempt.configRevision,
    status: attempt.status,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    providerMessageId: attempt.providerMessageId,
    error:
      attempt.errorCategory || attempt.errorCode || message
        ? { category: attempt.errorCategory, code: attempt.errorCode, message }
        : undefined,
  };
}

function toEventDto(event: DeliveryStatusEventRecord): DeliveryStatusEventDto {
  return {
    sequence: event.sequence,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    attemptId: event.attemptId,
    reason: event.reason,
    actor: event.actor,
    occurredAt: event.occurredAt,
  };
}

function maskEmail(address: string): string {
  const [local = "", domain = ""] = address.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

function maskIdentifier(value: string): string {
  return value.length <= 4
    ? "***"
    : `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function redactText(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+/g, "[redacted-email]")
    .replace(/((?:password|secret|token)\s*[=:])\s*\S+/gi, "$1[redacted]")
    .slice(0, 500);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
