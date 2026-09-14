import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAIL_SYNC_BATCH_SIZE,
  MAX_MAIL_SYNC_BATCH_SIZE,
  DEFAULT_MAIL_OAUTH_CALLBACK_PATH,
  mailConfig,
  resolveMailOAuthCallbackPath,
  resolveMailOAuthCallbackUrl,
  resolveMailOAuthOrigin,
  resolveMailSyncBatchSize,
} from '../server/config.js';

describe('mail sync configuration', () => {
  it('uses the bounded default and accepts the configured upper bound', () => {
    expect(resolveMailSyncBatchSize()).toBe(DEFAULT_MAIL_SYNC_BATCH_SIZE);
    expect(resolveMailSyncBatchSize(MAX_MAIL_SYNC_BATCH_SIZE)).toBe(
      MAX_MAIL_SYNC_BATCH_SIZE,
    );
  });

  it('rejects unsafe sync page sizes', () => {
    for (const value of [0, -1, 1.5, MAX_MAIL_SYNC_BATCH_SIZE + 1]) {
      expect(() => resolveMailSyncBatchSize(value)).toThrow(
        'Mail syncBatchSize must be an integer',
      );
    }
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
    expect(mailConfig.defaults).toMatchObject({
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
