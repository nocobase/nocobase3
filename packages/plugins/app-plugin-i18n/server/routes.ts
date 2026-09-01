import { getContextSession, LOCALE_SESSION_KEY } from '@nocobase/i18n/server';
import { i18nToken } from '@nocobase/app-server/i18n';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

/**
 * The language endpoints: what is available, and which one this session wants.
 *
 * The browser keeps its own copy in storage and is the source of truth for what it renders; this only tells the server
 * which language to answer in, so an error message or a mail body comes back in the language the visitor is reading.
 */
export const i18nApiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    const runtime = container.resolve(i18nToken);

    router.get('/i18n/locales', (context) =>
      context.json({
        defaultLocale: runtime.getDefaultLocale(),
        locales: runtime.getLocaleDefinitions(),
      }),
    );

    router.post('/i18n/locale', async (context) => {
      const body: unknown = await context.req.json().catch(() => undefined);
      const requested =
        body && typeof body === 'object' && 'locale' in body
          ? (body as { locale?: unknown }).locale
          : undefined;

      if (typeof requested !== 'string') {
        return context.json({ error: 'A locale is required.' }, 400);
      }

      // The value arrives from the browser, so it is checked against the configured list rather than stored as sent.
      const supported = runtime
        .getLocales()
        .find((locale) => locale === requested);
      if (!supported) {
        return context.json({ error: `Unsupported locale: ${requested}` }, 400);
      }

      const session = getContextSession(context);
      if (session) await session.set(LOCALE_SESSION_KEY, supported);

      return context.json({ locale: supported });
    });

    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  i18nApiRoutes,
];

export default routes;
