import {
  createAppClientServiceRegistry,
  type AppClient,
} from '@nocobase/app-sdk';
import type { AppClientRefineRegistry } from '@nocobase/app-client/plugins';
import { getOrCreateAppSettingsModuleRegistry } from '@nocobase/app-plugin-settings/client';
import { describe, expect, it, vi } from 'vitest';

import bootstrap from '../client/bootstrap.js';
import { dataProvider } from '../client/data-provider.js';

describe('client bootstrap', () => {
  it('registers the NocoBase data provider with the app runtime', async () => {
    const appClient: AppClient = {
      request: vi.fn<AppClient['request']>(),
      services: createAppClientServiceRegistry(),
    };
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

    await bootstrap({
      appClient,
      packageName: '@nocobase/app-plugin-data-provider',
      refine,
    });

    expect(setDataProvider).toHaveBeenCalledExactlyOnceWith(dataProvider);
    expect(
      appClient.services.has('@nocobase/app-plugin-settings:registry'),
    ).toBe(true);
    const module =
      getOrCreateAppSettingsModuleRegistry(appClient).get('data-sources');
    expect(module).toMatchObject({
      status: '已接入',
      placeholder: false,
      owner: 'Data Provider',
      boundary: expect.stringContaining('不提供连接配置'),
    });
    expect(module?.pageLoader).toBeTypeOf('function');
  });
});
