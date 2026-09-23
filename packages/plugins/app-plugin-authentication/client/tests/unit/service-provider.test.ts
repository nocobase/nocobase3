import type { ClientApplication } from '@nocobase/app-client';
import { describe, expect, it, vi } from 'vitest';
import { AuthenticationServiceProvider } from '../../service-provider.js';
import { authenticationClientToken } from '../../tokens.js';

const createAuthClient = vi.hoisted(() =>
  vi.fn(() => ({ kind: 'auth-client' })),
);
vi.mock('../../auth-client.js', () => ({ createAuthClient }));

describe('AuthenticationServiceProvider', () => {
  it('registers a client using the configured API URL', async () => {
    let clientFactory: (() => unknown) | undefined;
    const singleton = vi.fn((token: unknown, factory: () => unknown) => {
      expect(token).toBe(authenticationClientToken);
      clientFactory = factory;
    });
    const app = {
      config: {
        get: (key: string) =>
          key === 'api.baseURL' ? 'https://example.com/main/api/' : undefined,
      },
      container: { singleton },
    } as unknown as ClientApplication;
    await new AuthenticationServiceProvider(app).boot();
    expect(singleton).toHaveBeenCalledOnce();
    expect(createAuthClient).toHaveBeenCalledWith({
      baseURL: 'https://example.com/main/api/auth',
    });
    expect(clientFactory?.()).toEqual({ kind: 'auth-client' });
  });
});
