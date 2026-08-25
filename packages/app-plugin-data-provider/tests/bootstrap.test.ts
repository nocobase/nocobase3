import {
  createAppClientServiceRegistry,
  type AppClient,
} from '@nocobase/app-sdk';
import type { AppClientRefineRegistry } from '@nocobase/app-client/plugins';
import { describe, expect, it, vi } from 'vitest';

import bootstrap from '../client/bootstrap.js';
import { dataProvider } from '../client/data-provider.js';
import {
  configureAppDataSourceSettings,
  getAppDataSourceSettings,
} from '../client/settings-configuration.js';
import { getOrCreateAppSettingsModuleRegistry } from '@nocobase/app-plugin-settings/client';

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
    expect(module).toMatchObject({ status: '已接入', placeholder: false });
    expect(module?.pageLoader).toBeTypeOf('function');
  });

  it('keeps the shared page configuration App-scoped and repeatable', () => {
    const appClient = createAppClientServiceRegistry();
    const client = {
      request: vi.fn<AppClient['request']>(),
      services: appClient,
    } satisfies AppClient;
    const input = {
      description: '查看订单数据源。',
      collections: [
        {
          name: 'orders',
          title: '订单',
          description: '订单业务数据',
          route: '/orders',
        },
      ],
    } as const;

    const first = configureAppDataSourceSettings(client, input);
    const second = configureAppDataSourceSettings(client, input);
    expect(second).toBe(first);
    expect(getAppDataSourceSettings(client)).toEqual(input);
  });

  it('rejects duplicate collections and cross-site routes', () => {
    const createClient = (): AppClient => ({
      request: vi.fn<AppClient['request']>(),
      services: createAppClientServiceRegistry(),
    });
    expect(() =>
      configureAppDataSourceSettings(createClient(), {
        description: '重复数据集',
        collections: [
          { name: 'orders', title: '订单', description: 'A' },
          { name: 'orders', title: '订单', description: 'B' },
        ],
      }),
    ).toThrow('Duplicate');
    expect(() =>
      configureAppDataSourceSettings(createClient(), {
        description: '非法地址',
        collections: [
          {
            name: 'orders',
            title: '订单',
            description: '订单',
            route: '//example.com/orders',
          },
        ],
      }),
    ).toThrow('root-relative');
  });
});
