import type { ApiKeySummary } from './api-keys-client.js';

export type ApiKeyExpiryChoice = 'never' | '7' | '30' | '90' | '365';

/**
 * The lifetimes the create dialog offers.
 *
 * Better Auth measures `expiresIn` in seconds but validates it in whole days
 * against `keyExpiration.minExpiresIn` and `maxExpiresIn`, which default to 1
 * and 365. Every choice here stays inside that window, so the dialog cannot
 * offer a lifetime the server will refuse.
 */
export const API_KEY_EXPIRY_CHOICES: readonly ApiKeyExpiryChoice[] = [
  'never',
  '7',
  '30',
  '90',
  '365',
];

const SECONDS_PER_DAY = 24 * 60 * 60;

/** Seconds to send as `expiresIn`, or undefined for a key that never expires. */
export function expiryChoiceToSeconds(
  choice: ApiKeyExpiryChoice,
): number | undefined {
  return choice === 'never' ? undefined : Number(choice) * SECONDS_PER_DAY;
}

/**
 * The part of a key that is safe to show.
 *
 * `start` is the leading characters Better Auth stored at creation, prefix
 * included. The stored `key` is a hash and is never returned by the list
 * endpoint, so this is all a listed key can be recognized by.
 */
export function formatKeyHint(
  key: Pick<ApiKeySummary, 'prefix' | 'start'>,
): string {
  if (key.start) return `${key.start}…`;
  if (key.prefix) return `${key.prefix}…`;
  return '—';
}

export function isExpired(
  expiresAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= now.getTime();
}
