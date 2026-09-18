import { KeyRound } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import apiKeys from '../client/plugin.js';
import {
  API_KEY_EXPIRY_CHOICES,
  expiryChoiceToSeconds,
  formatKeyHint,
  isExpired,
} from '../client/expiry.js';
import {
  createApiKeysRoutes,
  normalizeApiKeysRoutePath,
} from '../client/routes.js';

describe('@nocobase/app-plugin-api-keys Client', () => {
  it('mounts one Settings page at a relative path', async () => {
    const registration = apiKeys({});

    expect(registration.serviceProviders).toEqual([]);
    expect(registration.routes).toHaveLength(1);
    expect(registration.routes[0]).toMatchObject({
      parent: 'settings',
      routes: [
        {
          name: 'api-keys',
          path: '/api-keys',
          authz: {
            resource: { type: 'page', id: 'api-keys' },
            action: 'access',
          },
          navigation: { title: 'nav.apiKeys', icon: KeyRound },
        },
      ],
    });
    await expect(
      registration.routes[0]?.routes[0]?.componentLoader(),
    ).resolves.toMatchObject({ default: expect.any(Function) });
  });

  it('lets an application choose the path and the menu label', () => {
    expect(
      createApiKeysRoutes({ path: 'tokens/', title: 'Tokens' }),
    ).toMatchObject({
      routes: [{ path: '/tokens', navigation: { title: 'Tokens' } }],
    });
  });

  it('refuses a route path that repeats its own mount', () => {
    expect(() => normalizeApiKeysRoutePath('/settings/api-keys')).toThrow(
      TypeError,
    );
    expect(() => normalizeApiKeysRoutePath('/')).toThrow(TypeError);
  });

  it('offers only lifetimes Better Auth accepts', () => {
    // Better Auth validates expiresIn in whole days against a 1..365 window.
    for (const choice of API_KEY_EXPIRY_CHOICES) {
      const seconds = expiryChoiceToSeconds(choice);
      if (seconds === undefined) continue;
      const days = seconds / 86_400;
      expect(days).toBeGreaterThanOrEqual(1);
      expect(days).toBeLessThanOrEqual(365);
      expect(Number.isInteger(days)).toBe(true);
    }
    expect(expiryChoiceToSeconds('never')).toBeUndefined();
    expect(expiryChoiceToSeconds('30')).toBe(2_592_000);
  });

  it('shows only the part of a key that was stored in the clear', () => {
    expect(formatKeyHint({ start: 'nb_abc', prefix: 'nb_' })).toBe('nb_abc…');
    expect(formatKeyHint({ start: null, prefix: 'nb_' })).toBe('nb_…');
    expect(formatKeyHint({ start: null, prefix: null })).toBe('—');
  });

  it('treats a key with no expiry as current', () => {
    const now = new Date('2026-09-15T00:00:00.000Z');

    expect(isExpired(null, now)).toBe(false);
    expect(isExpired('2026-09-14T23:59:59.000Z', now)).toBe(true);
    expect(isExpired('2026-09-15T00:00:01.000Z', now)).toBe(false);
  });
});
