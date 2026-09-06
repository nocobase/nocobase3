import {
  appApiClientToken,
  type AppClient,
  type ClientApplication,
} from '@nocobase/app-client';
import { describe, expect, it, vi } from 'vitest';

import { MailClientServiceProvider } from '../client/service-provider.js';
import { getMailClient } from '../client/runtime.js';

describe('Mail client ServiceProvider', () => {
  it('configures the shared Mail API client without application navigation', async () => {
    const appClient: AppClient = {
      request: vi.fn<AppClient['request']>(async () => ({ data: [] })),
      stream: vi.fn<AppClient['stream']>(),
    };
    const app = {
      container: {
        resolve: vi.fn((token) => {
          expect(token).toBe(appApiClientToken);
          return appClient;
        }),
      },
    } as unknown as ClientApplication;

    await new MailClientServiceProvider(app).boot();
    await getMailClient().listAccounts();

    expect(appClient.request).toHaveBeenCalledWith('mail/accounts');
  });
});
