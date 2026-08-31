import {
  appApiClientToken,
  type AppClient,
  type ClientApplication,
} from '@nocobase/app-client';
import type { AppClientRefineRegistry } from '@nocobase/app-client/plugins';
import { describe, expect, it, vi } from 'vitest';

import { AuthenticationServiceProvider } from '../service-provider.js';

describe('client ServiceProvider', () => {
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

    const app = {
      container: {
        resolve: vi.fn((token) => {
          expect(token).toBe(appApiClientToken);
          return appClient;
        }),
      },
      refine,
    } as unknown as ClientApplication;
    await new AuthenticationServiceProvider(app).boot();

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
