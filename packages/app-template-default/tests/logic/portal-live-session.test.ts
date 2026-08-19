// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createPortalLiveSession } from '../../registry/portal-live/server/session.ts';

describe('Portal Live session protocol', () => {
  it('requires one successful auth before subscribing and binds app/user', async () => {
    const subscribed: string[] = [];
    const session = createPortalLiveSession({
      authenticator: { authenticate: async (token) => token === 'secret' ? { appId: 'main', userId: 'user-1' } : undefined },
      onSubscribe: (principal) => subscribed.push(`${principal.appId}:${principal.userId}`),
      onUnsubscribe: () => undefined,
    });
    await expect(session.handle({ version: 1, type: 'subscribe', subscriptionId: 's1', channel: 'notifications/inbox' })).resolves.toEqual({ type: 'error', code: 'AUTH_REQUIRED' });
    await expect(session.handle({ version: 1, type: 'auth', token: 'secret' })).resolves.toMatchObject({ type: 'auth_ok' });
    await expect(session.handle({ version: 1, type: 'subscribe', subscriptionId: 's1', channel: 'notifications/inbox' })).resolves.toEqual({ type: 'subscribed', subscriptionId: 's1' });
    expect(subscribed).toEqual(['main:user-1']);
  });

  it('enforces channel and subscription limits', async () => {
    const session = createPortalLiveSession({ authenticator: { authenticate: async () => ({ appId: 'main', userId: 'user-1' }) }, maxSubscriptions: 1, onSubscribe: () => undefined, onUnsubscribe: () => undefined });
    await session.handle({ version: 1, type: 'auth' });
    await expect(session.handle({ version: 1, type: 'subscribe', subscriptionId: 's1', channel: 'other' })).resolves.toEqual({ type: 'error', code: 'INVALID_CHANNEL' });
    await session.handle({ version: 1, type: 'subscribe', subscriptionId: 's1', channel: 'notifications/inbox' });
    await expect(session.handle({ version: 1, type: 'subscribe', subscriptionId: 's2', channel: 'notifications/inbox' })).resolves.toEqual({ type: 'error', code: 'SUBSCRIPTION_LIMIT' });
  });
});
