import type { AppClient } from '@nocobase/app-sdk';
import type { AppClientRefineRegistry } from '@nocobase/app-client/plugins';
import { describe, expect, it, vi } from 'vitest';

import bootstrap from '../client/bootstrap.js';

describe('client bootstrap', () => {
  it('registers the notification provider with the app runtime', async () => {
    const appClient: AppClient = {
      request: vi.fn<AppClient['request']>(),
    };
    const setNotificationProvider = vi.fn();
    const refine: AppClientRefineRegistry = {
      addLiveEventHandler: vi.fn(),
      addResources: vi.fn(),
      setAccessControlProvider: vi.fn(),
      setAuditLogProvider: vi.fn(),
      setAuthProvider: vi.fn(),
      setChildren: vi.fn(),
      setDataProvider: vi.fn(),
      setI18nProvider: vi.fn(),
      setLiveProvider: vi.fn(),
      setNotificationProvider,
      setOnLiveEvent: vi.fn(),
      setOptions: vi.fn(),
      setResources: vi.fn(),
      setRouterProvider: vi.fn(),
    };

    await bootstrap({
      appClient,
      packageName: '@nocobase/app-plugin-notification-provider',
      refine,
    });

    expect(setNotificationProvider).toHaveBeenCalledExactlyOnceWith({
      close: expect.any(Function),
      open: expect.any(Function),
    });
  });
});
