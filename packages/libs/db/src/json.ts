import type { JsonValue } from '@nocobase/repository-input';

export type { JsonValue };

/**
 * JSON columns use the same structured value contract at the public API
 * boundary. Drivers may return either parsed values or serialized text.
 */
export function encodeJsonValue(value: JsonValue): string | null {
  return value === null ? null : JSON.stringify(value);
}

export function decodeJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value !== 'string') return value as JsonValue;
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    // Some drivers already decode a JSON string scalar before returning it.
    return value;
  }
}
