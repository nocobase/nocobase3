import type { ClientApplication } from '@nocobase/app-client';
import type {
  AppClientRefineRegistry,
  ClientServiceProviderContext,
} from '@nocobase/app-client/plugins';
import { describe, expect, it, vi } from 'vitest';

import { NotificationProviderServiceProvider } from '../client/service-provider.js';

describe('client ServiceProvider', () => {
  it('registers the notification provider with the app runtime', async () => {
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

    const app = {
      refine,
    } as unknown as ClientApplication;
    const context: ClientServiceProviderContext = {
      packageName: '@nocobase/app-plugin-notification-provider',
      source: 'plugin',
      options: {},
    };
    await new NotificationProviderServiceProvider(app, context).boot();

    expect(setNotificationProvider).toHaveBeenCalledExactlyOnceWith({
      close: expect.any(Function),
      open: expect.any(Function),
    });
  });
});
