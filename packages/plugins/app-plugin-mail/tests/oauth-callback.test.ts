import { createConfigPaths } from '@nocobase/app-server/config';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { I18nRuntime } from '@nocobase/i18n';
import { createI18nMiddleware } from '@nocobase/i18n/server';
import { describe, expect, it, vi } from 'vitest';

import { mailOAuthCallbackRoutes } from '../server/routes/oauth-callback.js';
import { mailServiceToken } from '../server/tokens.js';
import type { MailService } from '../server/types.js';
import serverLocales from '../server/locales/index.js';

describe('Mail OAuth callback route', () => {
  it('is public but requires a valid state value', async () => {
    const completeAuthorization = vi.fn<MailService['completeAuthorization']>(
      async () => ({
        id: 'account-1',
        userId: 'user-1',
        provider: { type: 'gmail', name: 'google' },
        address: 'user@example.com',
        scopes: [],
        status: 'active',
        isDefault: true,
      }),
    );
    const router = await createRouter(service({ completeAuthorization }));

    const missing = await router.request('/mail/oauth/callback');
    expect(missing.status).toBe(400);
    expect(completeAuthorization).not.toHaveBeenCalled();

    const completed = await router.request(
      '/mail/oauth/callback?state=state-1&code=code-1',
    );
    expect(completed.status).toBe(302);
    expect(completed.headers.get('location')).toBe(
      '/test/dev/mail?mailAuthorization=success',
    );
    expect(completeAuthorization).toHaveBeenCalledWith({
      state: 'state-1',
      code: 'code-1',
    });
  });

  it('redirects Provider callback errors without exposing their details', async () => {
    const router = await createRouter(
      service({
        completeAuthorization: async () => {
          throw new Error('secret token exchange response');
        },
      }),
    );
    const response = await router.request(
      '/mail/oauth/callback?state=state-1&error=access_denied',
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      '/test/dev/mail?mailAuthorization=failure',
    );
  });
});

async function createRouter(mail: MailService): Promise<Hono> {
  const container = new ServiceContainer();
  container.instance(mailServiceToken, mail);
  const contribution = await mailOAuthCallbackRoutes.createRouter({
    appName: 'test',
    publicBasePath: '/test',
    config: { app: { name: 'test', publicBasePath: '/test' } },
    paths: createConfigPaths({ rootDir: '/missing' }),
    router: new Hono(),
    container,
  });
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerNamespace('@nocobase/app-plugin-mail', serverLocales);
  await runtime.init();
  const router = new Hono();
  router.use('*', createI18nMiddleware(runtime));
  router.route('/', contribution);
  return router;
}

function service(overrides: Partial<MailService> = {}): MailService {
  return {
    listProviders: async () => [],
    startAuthorization: async () => ({
      authorizationUrl: 'https://example.com/authorize',
      state: 'state-1',
    }),
    completeAuthorization: async () => {
      throw new Error('Not implemented.');
    },
    listAccounts: async () => [],
    listFolders: async () => [],
    listIdentities: async () => [],
    startSync: async () => {
      throw new Error('Not implemented.');
    },
    getSyncRun: async () => undefined,
    listMessages: async () => ({ items: [] }),
    getMessage: async () => undefined,
    listConversationMessages: async () => ({ items: [] }),
    sendMessage: async () => {
      throw new Error('Not implemented.');
    },
    ...overrides,
  };
}
