import {
  appApiClientToken,
  type AppClient,
  type ClientApplication,
} from '@nocobase/app-client';
import type { AppClientRefineRegistry } from '@nocobase/app-client/plugins';
import { describe, expect, it, vi } from 'vitest';

import { MailClientServiceProvider } from '../client/service-provider.js';

describe('Mail client ServiceProvider', () => {
  it('registers the Mail workspace in application navigation', async () => {
    const appClient: AppClient = {
      request: vi.fn<AppClient['request']>(),
      stream: vi.fn<AppClient['stream']>(),
    };
    const addResources = vi.fn();
    const refine: AppClientRefineRegistry = {
      addLiveEventHandler: vi.fn(),
      addResources,
      setAccessControlProvider: vi.fn(),
      setAuditLogProvider: vi.fn(),
      setAuthProvider: vi.fn(),
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

    await new MailClientServiceProvider(app).boot();

    expect(addResources).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({
        name: 'mail',
        list: '/mail',
        meta: expect.objectContaining({
          label: 'nav.workspace',
          i18nNs: '@nocobase/app-plugin-mail',
        }),
      }),
    ]);
  });
});
