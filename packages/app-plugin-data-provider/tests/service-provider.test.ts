import type { ClientApplication } from '@nocobase/app-client';
import type { AppClientRefineRegistry } from '@nocobase/app-client/plugins';
import { describe, expect, it, vi } from 'vitest';

import { dataProvider } from '../client/data-provider.js';
import { DataProviderServiceProvider } from '../client/service-provider.js';

describe('client ServiceProvider', () => {
  it('registers the NocoBase data provider with the app runtime', async () => {
    const setDataProvider = vi.fn();
    const refine: AppClientRefineRegistry = {
      addLiveEventHandler: vi.fn(),
      addResources: vi.fn(),
      setAccessControlProvider: vi.fn(),
      setAuditLogProvider: vi.fn(),
      setAuthProvider: vi.fn(),
      setChildren: vi.fn(),
      setDataProvider,
      setI18nProvider: vi.fn(),
      setLiveProvider: vi.fn(),
      setNotificationProvider: vi.fn(),
      setOnLiveEvent: vi.fn(),
      setOptions: vi.fn(),
      setResources: vi.fn(),
      setRouterProvider: vi.fn(),
    };

    const app = {
      refine,
    } as unknown as ClientApplication;
    await new DataProviderServiceProvider(app).boot();

    expect(setDataProvider).toHaveBeenCalledExactlyOnceWith(dataProvider);
  });
});
