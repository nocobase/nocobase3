import type { AppClient } from '@nocobase/app-sdk';
import { describe, expect, it, vi } from 'vitest';

import { createAuthClient } from '../auth-client.js';

describe('AuthClient', () => {
  it('sends a JSON body when signing out', async () => {
    const request = vi.fn<AppClient['request']>().mockResolvedValue(undefined);
    const refreshSession = vi.fn();
    const client = createAuthClient({
      client: { request, realtime: { refreshSession } } as AppClient,
    });

    await client.signOut();

    expect(request).toHaveBeenCalledWith('auth/sign-out', {
      method: 'POST',
      body: '{}',
    });
    expect(refreshSession).toHaveBeenCalledOnce();
  });

  it('sends a reset password request with the token', async () => {
    const request = vi.fn<AppClient['request']>().mockResolvedValue(undefined);
    const client = createAuthClient({
      client: {
        request,
        realtime: { refreshSession: vi.fn() },
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
