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
  const recipients = ('type' in input.to ? [input.to] : input.to).map(
    normalizeValue,
  );
  const channels = [...new Set(input.channels)].sort();
  const routing = Object.fromEntries(
    channels
      .map(
        (channel) =>
          [channel, normalizeRouting(input.routing?.[channel])] as const,
      )
      .filter(
        (entry): entry is readonly [string, unknown] => entry[1] !== undefined,
      ),
  );
  const channelOverrides = Object.fromEntries(
    channels
      .map(
        (channel) =>
          [channel, normalizeValue(input.channelOverrides?.[channel])] as const,
      )
      .filter(
        (entry): entry is readonly [string, unknown] => entry[1] !== undefined,
      ),
  );
  const canonical = normalizeValue({
    source: input.source,
    recipients: sorted(recipients),
    channels,
    routing,
    content: input.content,
    channelOverrides,
  });
  return `v1:${createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex')}`;
}

function normalizeRouting(value: unknown): unknown {
  const normalized = normalizeValue(value);
  if (!isRecord(normalized)) return normalized;
  const providers = normalized.providers;
  if (!isRecord(providers)) return undefined;
  if (providers.strategy === 'all') {
    return {
      providers: {
        strategy: 'all',
        ...(Array.isArray(providers.providers)
          ? { providers: uniqueSorted(providers.providers.map(normalizeValue)) }
          : {}),
      },
    };
  }
  return typeof providers.provider === 'string'
    ? { providers: { strategy: 'single', provider: providers.provider } }
    : undefined;
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeValue(item)]),
  );
}

function uniqueSorted(values: readonly unknown[]): readonly unknown[] {
  return [
    ...new Map(values.map((value) => [JSON.stringify(value), value])).entries(),
  ]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

function sorted(values: readonly unknown[]): readonly unknown[] {
  return values
    .map((value) => [JSON.stringify(value), value] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
