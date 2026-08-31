import { createAuthClient, type AuthClient } from '../auth-client.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAuthProvider } from '../auth-provider.js';

describe('authentication provider password reset flow', () => {
  beforeEach(() => {
    Object.assign(window, { NOCOBASE_PORTAL_BASE: '/main/' });
    window.history.replaceState({}, '', '/main/');
  });

  it('requests a basename-aware reset callback', async () => {
    const client = createAuthClientMock();
    const provider = createAuthProvider(client);

    await expect(
      provider.forgotPassword?.({ email: 'alice@example.com' }),
    ).resolves.toEqual({ success: true });
    expect(client.requestPasswordReset).toHaveBeenCalledWith(
      'alice@example.com',
      '/main/reset-password',
    );
  });

  it('uses the URL token when updating the password', async () => {
    const client = createAuthClientMock();
    const provider = createAuthProvider(client);
    window.history.replaceState(
      {},
      '',
      '/main/reset-password?token=reset-token',
    );

    await expect(
      provider.updatePassword?.({ newPassword: 'new-password' }),
    ).resolves.toEqual({ success: true, redirectTo: '/login' });
    expect(client.resetPassword).toHaveBeenCalledWith(
      'new-password',
      'reset-token',
    );
  });

  it('refreshes realtime authentication when the session is anonymous', async () => {
    const client = createAuthClientMock();
    vi.spyOn(client, 'getSession').mockResolvedValue(null);
    const refreshRealtimeSession = vi.spyOn(client, 'refreshRealtimeSession');
    const provider = createAuthProvider(client);

    await expect(provider.check()).resolves.toEqual({
      authenticated: false,
      redirectTo: '/login',
    });
    expect(refreshRealtimeSession).toHaveBeenCalledOnce();
  });

  it('refreshes realtime authentication after an unauthorized response', async () => {
    const client = createAuthClientMock();
    const refreshRealtimeSession = vi.spyOn(client, 'refreshRealtimeSession');
    const provider = createAuthProvider(client);

    await expect(provider.onError({ status: 401 })).resolves.toEqual({
      logout: true,
      redirectTo: '/login',
    });
    expect(refreshRealtimeSession).toHaveBeenCalledOnce();
  });
});

function createAuthClientMock(): AuthClient {
  const client = createAuthClient({
    client: { request: vi.fn() },
  });
  vi.spyOn(client, 'requestPasswordReset').mockResolvedValue(undefined);
  vi.spyOn(client, 'resetPassword').mockResolvedValue(undefined);
  return client;
}
