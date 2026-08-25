import type { AppClient } from '@nocobase/app-sdk';
import type { AppClientRefineRegistry } from '@nocobase/app-client/plugins';
import { describe, expect, it, vi } from 'vitest';

import bootstrap from '../bootstrap.js';

describe('client bootstrap', () => {
  it('registers the authentication provider with the app runtime', async () => {
    const appClient: AppClient = {
      request: vi.fn<AppClient['request']>(),
    };
    const setAuthProvider = vi.fn();
    const refine: AppClientRefineRegistry = {
      addLiveEventHandler: vi.fn(),
      addResources: vi.fn(),
      setAccessControlProvider: vi.fn(),
      setAuditLogProvider: vi.fn(),
      setAuthProvider,
      setChildren: vi.fn(),
      setDataProvider: vi.fn(),
      setI18nProvider: vi.fn(),
      setLiveProvider: vi.fn(),
      setNotificationProvider: vi.fn(),
      setOnLiveEvent: vi.fn(),
      setOptions: vi.fn(),
      setResources: vi.fn(),
      setRouterProvider: vi.fn(),
    };

    await bootstrap({
      appClient,
      packageName: '@nocobase/app-plugin-authentication',
      refine,
    });

    expect(setAuthProvider).toHaveBeenCalledExactlyOnceWith({
      login: expect.any(Function),
      register: expect.any(Function),
      forgotPassword: expect.any(Function),
      updatePassword: expect.any(Function),
      logout: expect.any(Function),
      check: expect.any(Function),
      getIdentity: expect.any(Function),
      onError: expect.any(Function),
    });
  });
});
