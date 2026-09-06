import type { ApiClient, RealtimeClient } from '@nocobase/app-client';
import { describe, expect, it, vi } from 'vitest';

import { createAuthClient } from '../auth-client.js';

describe('AuthClient', () => {
  it('sends a JSON body when signing out', async () => {
    const request = vi.fn<ApiClient['request']>().mockResolvedValue(undefined);
    const reconnect = vi.fn();
    const client = createAuthClient({
      api: { request } as ApiClient,
      realtime: createRealtimeClient(reconnect),
    });

    await client.signOut();

    expect(request).toHaveBeenCalledWith({
      path: 'auth/sign-out',
      method: 'POST',
      json: {},
    });
    expect(reconnect).toHaveBeenCalledOnce();
  });

  it('sends a reset password request with the token', async () => {
    const request = vi.fn<ApiClient['request']>().mockResolvedValue(undefined);
    const client = createAuthClient({
      api: { request } as ApiClient,
      realtime: createRealtimeClient(vi.fn()),
    });

    await client.resetPassword('new-password', 'reset-token');

    expect(request).toHaveBeenCalledWith({
      path: 'auth/reset-password',
      method: 'POST',
      json: {
        newPassword: 'new-password',
        token: 'reset-token',
      },
    });
  });
});

function createRealtimeClient(reconnect: () => void): RealtimeClient {
  return {
    connected: false,
    subscribe: vi.fn(() => vi.fn()),
    onOpen: vi.fn(() => vi.fn()),
    onError: vi.fn(() => vi.fn()),
    reconnect,
    close: vi.fn(),
  };
}
