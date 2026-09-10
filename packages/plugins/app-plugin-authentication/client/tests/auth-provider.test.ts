import { usernameClient } from 'better-auth/client/plugins';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthClient } from '../auth-client.js';
import { createAuthProvider } from '../auth-provider.js';

function setup(response: unknown = null, status = 200) {
  const fetch = vi
    .fn()
    .mockImplementation(async () => Response.json(response, { status }));
  const reconnect = vi.fn();
  const client = createAuthClient({
    baseURL: 'http://localhost/main/api/auth',
    plugins: [usernameClient({ displayUsername: false })],
    fetchOptions: { customFetchImpl: fetch },
  });
  return {
    provider: createAuthProvider(client, { reconnect }),
    fetch,
    reconnect,
  };
}

describe('native authentication Refine adapter', () => {
  beforeEach(() => {
    Object.assign(window, { APP_BASE_PATH: '/main/' });
    window.history.replaceState({}, '', '/main/');
  });
  it('uses the public callback URL for password reset', async () => {
    const { provider, fetch } = setup({ status: true });
    await expect(
      provider.forgotPassword?.({ email: 'alice@example.com' }),
    ).resolves.toEqual({ success: true });
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body as string)).toEqual({
      email: 'alice@example.com',
      redirectTo: new URL('/main/reset-password', window.location.origin).href,
    });
  });
  it('uses the URL token to reset a password', async () => {
    const { provider, fetch } = setup({ status: true });
    window.history.replaceState(
      {},
      '',
      '/main/reset-password?token=reset-token',
    );
    await expect(
      provider.updatePassword?.({ newPassword: 'new-password' }),
    ).resolves.toEqual({ success: true, redirectTo: '/login' });
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body as string)).toEqual({
      newPassword: 'new-password',
      token: 'reset-token',
    });
  });
  it('reconnects when the current session is anonymous', async () => {
    const { provider, reconnect } = setup();
    await expect(provider.check()).resolves.toEqual({
      authenticated: false,
      redirectTo: '/login',
    });
    expect(reconnect).toHaveBeenCalledOnce();
  });
  it('returns a failed login for native API errors', async () => {
    const { provider, reconnect } = setup(
      { message: 'Invalid credentials' },
      401,
    );
    await expect(
      provider.login({ identifier: 'alice', password: 'wrong' }),
    ).resolves.toMatchObject({
      success: false,
      error: { message: 'Invalid credentials' },
    });
    expect(reconnect).not.toHaveBeenCalled();
  });
  it('reconnects after successful login and logout', async () => {
    const { provider, reconnect } = setup({
      token: 'token',
      user: { id: '1' },
    });
    await expect(
      provider.login({ identifier: 'alice', password: 'password' }),
    ).resolves.toMatchObject({ success: true });
    await provider.logout({});
    expect(reconnect).toHaveBeenCalledTimes(2);
  });
});
