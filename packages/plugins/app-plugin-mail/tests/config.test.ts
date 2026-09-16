import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAIL_OAUTH_CALLBACK_PATH,
  DEFAULT_MAIL_CONFIG,
  DEFAULT_MAIL_AUTOMATIC_SYNC_INTERVAL_MINUTES,
  resolveMailAutomaticSyncIntervalFromMs,
  resolveMailAutomaticSyncIntervalMinutes,
  resolveMailOAuthCallbackPath,
  resolveMailOAuthCallbackUrl,
  resolveMailOAuthOrigin,
} from '../server/config.js';

describe('mail automatic sync configuration', () => {
  it('uses a five-minute automatic sync default and accepts positive minute values', () => {
    expect(resolveMailAutomaticSyncIntervalMinutes()).toBe(
      DEFAULT_MAIL_AUTOMATIC_SYNC_INTERVAL_MINUTES,
    );
    expect(resolveMailAutomaticSyncIntervalMinutes(30)).toBe(30);
    expect(resolveMailAutomaticSyncIntervalFromMs(90_001)).toBe(2);
  });

  it('rejects non-positive or unsafe automatic sync intervals', () => {
    for (const value of [0, -1, 1.5, Number.POSITIVE_INFINITY]) {
      expect(() => resolveMailAutomaticSyncIntervalMinutes(value)).toThrow(
        'Mail automatic sync interval',
      );
    }
    expect(() => resolveMailAutomaticSyncIntervalFromMs(59_999)).toThrow(
      'automaticSyncIntervalMs',
    );
  });
});

describe('mail OAuth callback configuration', () => {
  it('follows localhost when the configured development origin uses 127.0.0.1', () => {
    expect(
      resolveMailOAuthOrigin(
        'http://127.0.0.1:13000',
        'http://localhost:13000',
      ),
    ).toBe('http://localhost:13000');
  });

  it('keeps an explicit origin when the request is not a loopback alias', () => {
    expect(
      resolveMailOAuthOrigin(
        'https://mail.example.com',
        'http://localhost:13000',
      ),
    ).toBe('https://mail.example.com');
  });

  it('uses the default path with the application origin and base path', () => {
    expect(DEFAULT_MAIL_CONFIG).toMatchObject({
      oauthCallbackUrl: DEFAULT_MAIL_OAUTH_CALLBACK_PATH,
    });
    expect(
      resolveMailOAuthCallbackUrl(
        undefined,
        'https://mail.example.com',
        '/main',
      ),
    ).toBe('https://mail.example.com/main/mail/oauth/callback');
    expect(resolveMailOAuthCallbackPath(undefined, '/main')).toBe(
      '/mail/oauth/callback',
    );
  });

  it('supports an absolute callback URL under the application base path', () => {
    const configuredUrl =
      'https://oauth.example.com/customer/mail/oauth/callback';
    expect(
      resolveMailOAuthCallbackUrl(
        configuredUrl,
        'https://ignored.example.com',
        '/customer',
      ),
    ).toBe(configuredUrl);
    expect(resolveMailOAuthCallbackPath(configuredUrl, '/customer')).toBe(
      '/mail/oauth/callback',
    );
  });

  it('rejects an absolute callback URL outside the application base path', () => {
    expect(() =>
      resolveMailOAuthCallbackPath(
        'https://oauth.example.com/mail/oauth/callback',
        '/customer',
      ),
    ).toThrow('must include application public base path');
  });
});
