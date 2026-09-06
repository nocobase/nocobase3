import {
  apiClientToken,
  type ApiClient,
  type ClientApplication,
  type RealtimeClient,
  realtimeClientToken,
} from '@nocobase/app-client';
import type { AppClientRefineRegistry } from '@nocobase/app-client/plugins';
import { describe, expect, it, vi } from 'vitest';

import { AuthenticationServiceProvider } from '../service-provider.js';

describe('client ServiceProvider', () => {
  it('registers the authentication provider with the app runtime', async () => {
    const api = { request: vi.fn<ApiClient['request']>() } as ApiClient;
    const realtime: RealtimeClient = {
      connected: false,
      subscribe: vi.fn(() => vi.fn()),
      onOpen: vi.fn(() => vi.fn()),
      onError: vi.fn(() => vi.fn()),
      reconnect: vi.fn(),
      close: vi.fn(),
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
          if (token === apiClientToken) return api;
          if (token === realtimeClientToken) return realtime;
          throw new Error('Unexpected client service token.');
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
