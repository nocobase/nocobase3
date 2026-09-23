import { describe, expect, it } from 'vitest';
import {
  notificationRequestFingerprint,
  validateNotificationIdempotencyKey,
} from '../server/idempotency.js';

describe('notification idempotency', () => {
  it('normalizes Channel and object key order', () => {
    const first = {
      idempotencyKey: 'approval:42',
      messages: {
        email: { to: 'a@example.com', subject: 'Approved', text: 'Hello' },
        hook: { text: 'Hello' },
      },
    };
    const reordered = {
      idempotencyKey: 'approval:42',
      messages: {
        hook: { text: 'Hello' },
        email: { text: 'Hello', subject: 'Approved', to: 'a@example.com' },
      },
    };
    expect(notificationRequestFingerprint(first)).toBe(
      notificationRequestFingerprint(reordered),
    );
    expect(notificationRequestFingerprint(first)).not.toBe(
      notificationRequestFingerprint({
        ...first,
        messages: { hook: { text: 'Changed' } },
      }),
    );
    expect(notificationRequestFingerprint(first)).toBe(
      notificationRequestFingerprint({
        ...first,
        source: { type: 'application' },
      }),
    );
  });
  it('requires a trimmed key with a bounded length', () => {
    expect(() =>
      validateNotificationIdempotencyKey('order:42:user:7'),
    ).not.toThrow();
    for (const key of ['', ' padded ', 'x'.repeat(192)])
      expect(() => validateNotificationIdempotencyKey(key)).toThrow();
  });
});
