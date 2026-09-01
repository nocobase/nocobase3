import { I18nRuntime } from '@nocobase/i18n';
import { i18nToken } from '@nocobase/app-server/i18n';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { i18nApiRoutes } from '../../server/routes.js';

interface StoredSession {
  readonly values: Record<string, unknown>;
}

async function createRouter(
  session?: StoredSession,
): Promise<{ router: Hono; session?: StoredSession }> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  await runtime.init('en-US');

  const container = new ServiceContainer();
  container.instance(i18nToken, runtime);

  const routes = await i18nApiRoutes.createRouter({ container } as never);

  // The session middleware runs ahead of the routes, the way it is mounted in a real application, so it has to be
  // registered on an outer router rather than added to one that already carries them.
  const router = new Hono();
  if (session) {
    router.use('*', async (context, next) => {
      context.set(
        'session' as never,
        {
          get: () => Promise.resolve(session.values),
          set: (key: string, value: unknown) => {
            session.values[key] = value;
            return Promise.resolve();
          },
        } as never,
      );
      await next();
    });
  }
  router.route('/', routes);

  return { router, session };
}

describe('GET /i18n/locales', () => {
  it('reports the default locale and everything available', async () => {
    const { router } = await createRouter();

    const response = await router.request('/i18n/locales');

    await expect(response.json()).resolves.toEqual({
      defaultLocale: 'en-US',
      locales: [
        { locale: 'en-US', label: expect.any(String), direction: 'ltr' },
        { locale: 'zh-CN', label: expect.any(String), direction: 'ltr' },
      ],
    });
  });
});

describe('POST /i18n/locale', () => {
  it('stores a supported locale on the session', async () => {
    const session: StoredSession = { values: {} };
    const { router } = await createRouter(session);

    const response = await router.request('/i18n/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'zh-CN' }),
    });

    expect(response.status).toBe(200);
    expect(session.values).toEqual({ locale: 'zh-CN' });
  });

  it('rejects a locale the application does not offer', async () => {
    const session: StoredSession = { values: {} };
    const { router } = await createRouter(session);

    const response = await router.request('/i18n/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'fr-FR' }),
    });

    // The value comes from the browser, so it is checked rather than stored as sent.
    expect(response.status).toBe(400);
    expect(session.values).toEqual({});
  });

  it('rejects a request with no locale', async () => {
    const { router } = await createRouter();

    const response = await router.request('/i18n/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
  });

  it('rejects a malformed body instead of throwing', async () => {
    const { router } = await createRouter();

    const response = await router.request('/i18n/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    expect(response.status).toBe(400);
  });

  it('succeeds with no session mounted', async () => {
    const { router } = await createRouter();

    const response = await router.request('/i18n/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'zh-CN' }),
    });

    expect(response.status).toBe(200);
  });
});
