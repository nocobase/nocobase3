import { createHash } from 'node:crypto';

import type { NotificationChannelMap, NotificationSendInput } from './types.js';

const IDEMPOTENCY_KEY_MAX_LENGTH = 191;

export function validateNotificationIdempotencyKey(value: string): void {
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    throw new Error(
      'Notification idempotencyKey must be a non-empty trimmed string.',
    );
  }
  if (value.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new Error(
      `Notification idempotencyKey must not exceed ${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`,
    );
  }
}

export function notificationRequestFingerprint<
  TChannels extends NotificationChannelMap,
>(input: NotificationSendInput<TChannels>): string {
  const canonical = normalizeValue({
    source: {
      type: input.source?.type ?? 'application',
      referenceId: input.source?.referenceId,
    },
    messages: input.messages,
  });
  return `v2:${createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex')}`;
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => compareCanonicalStrings(left, right))
      .map(([key, item]) => [key, normalizeValue(item)]),
  );
}

function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
