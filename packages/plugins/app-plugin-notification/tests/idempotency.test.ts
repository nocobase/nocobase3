import { describe, expect, it } from 'vitest';

import {
  notificationRequestFingerprint,
  validateNotificationIdempotencyKey,
} from '../server/idempotency.js';
import type { NotificationSendInput } from '../server/types.js';

type Channels = {
  readonly email: {
    readonly recipient: { readonly address: string };
    readonly message: { readonly subject?: string; readonly text: string };
  };
};

describe('notification idempotency', () => {
  it('normalizes recipient, Channel, Provider, and object key order', () => {
    const first = request({
      to: [
        { type: 'email', address: 'b@example.com' },
        { type: 'email', address: 'a@example.com' },
      ],
      channels: ['email', 'email'],
      routing: {
        email: {
          providers: {
            strategy: 'all',
            providers: ['secondary', 'primary', 'secondary'],
          },
        },
      },
    });
    const reordered = request({
      to: [
        { address: 'a@example.com', type: 'email' },
        { address: 'b@example.com', type: 'email' },
      ],
      channels: ['email'],
      routing: {
        email: {
          providers: {
            providers: ['primary', 'secondary'],
            strategy: 'all',
          },
        },
      },
    });

    expect(notificationRequestFingerprint(first)).toBe(
      notificationRequestFingerprint(reordered),
    );
  });

  it('changes when a business-relevant input changes', () => {
    const first = request({});
    const changed = request({ content: { body: 'Different body.' } });

    expect(notificationRequestFingerprint(first)).not.toBe(
      notificationRequestFingerprint(changed),
    );
  });

  it('fingerprints a recipientless send without requiring `to`', () => {
    const input = request({ to: undefined });

    expect(notificationRequestFingerprint(input)).toBe(
      notificationRequestFingerprint({
        ...input,
        to: undefined,
      }),
    );
  });

  it('treats omitted and explicit default Provider routing as equivalent', () => {
    const omitted = request({});
    const explicit = request({
      routing: { email: { providers: { strategy: 'single' } } },
    });

    expect(notificationRequestFingerprint(omitted)).toBe(
      notificationRequestFingerprint(explicit),
    );
  });

  it('treats omitted and explicit default source as equivalent', () => {
    const omitted = request({ source: undefined });
    const explicit = request({ source: { type: 'application' } });

    expect(notificationRequestFingerprint(omitted)).toBe(
      notificationRequestFingerprint(explicit),
    );
  });

  it('requires a trimmed key with a bounded length', () => {
    expect(() =>
      validateNotificationIdempotencyKey('order:42:user:7'),
    ).not.toThrow();
    expect(() => validateNotificationIdempotencyKey('')).toThrow('non-empty');
    expect(() => validateNotificationIdempotencyKey(' padded ')).toThrow(
      'trimmed',
    );
    expect(() => validateNotificationIdempotencyKey('x'.repeat(192))).toThrow(
      '191',
    );
  });
});

function request(
  overrides: Partial<NotificationSendInput<Channels>>,
): NotificationSendInput<Channels> {
  return {
    idempotencyKey: 'order:42:user:7:email',
    source: { type: 'order-won', referenceId: '42' },
    to: { type: 'email', address: 'a@example.com' },
    channels: ['email'],
    content: { title: 'Order won', body: 'Order 42 was won.' },
    ...overrides,
  };
}
