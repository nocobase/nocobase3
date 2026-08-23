import type { AppClient } from '@nocobase/app-sdk';
import { describe, expect, it, vi } from 'vitest';

import bootstrap from '../bootstrap.js';

describe('client bootstrap', () => {
  it('registers the authentication provider with the app runtime', async () => {
    const appClient: AppClient = {
      request: vi.fn<AppClient['request']>(),
    };
    const setAuthProvider = vi.fn();

    await bootstrap({
      appClient,
      packageName: '@nocobase/app-plugin-authentication',
      refine: { setAuthProvider },
      routes: { add: vi.fn() },
    });

    expect(setAuthProvider).toHaveBeenCalledExactlyOnceWith({
      login: expect.any(Function),
      register: expect.any(Function),
      forgotPassword: expect.any(Function),
      logout: expect.any(Function),
      check: expect.any(Function),
      getIdentity: expect.any(Function),
      onError: expect.any(Function),
    });
  });
});
