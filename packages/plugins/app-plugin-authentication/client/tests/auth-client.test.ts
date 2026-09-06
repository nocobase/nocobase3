import type { AppClient } from '@nocobase/app-client';
import { describe, expect, it, vi } from 'vitest';

import { createAuthClient } from '../auth-client.js';

describe('AuthClient', () => {
  it('sends a JSON body when signing out', async () => {
    const request = vi.fn<AppClient['request']>().mockResolvedValue(undefined);
    const reconnect = vi.fn();
    const client = createAuthClient({
      client: { request, realtime: { reconnect } } as AppClient,
    });

    await client.signOut();

    expect(request).toHaveBeenCalledWith('auth/sign-out', {
      method: 'POST',
      body: '{}',
    });
    expect(reconnect).toHaveBeenCalledOnce();
  });

  it('sends a reset password request with the token', async () => {
    const request = vi.fn<AppClient['request']>().mockResolvedValue(undefined);
    const client = createAuthClient({
      client: {
        request,
        realtime: { reconnect: vi.fn() },
      } as AppClient,
    });

    await client.resetPassword('new-password', 'reset-token');

    expect(request).toHaveBeenCalledWith('auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        newPassword: 'new-password',
        token: 'reset-token',
      }),
    });
  });
});
