import { I18nRuntime } from '@nocobase/i18n';
import { createI18nMiddleware } from '@nocobase/i18n/server';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  createNotificationRouter,
  NOTIFICATION_NAMESPACE,
  notificationServerLocales,
} from '../server/index.js';

describe('notification router', () => {
  it('lists redacted notification details', async () => {
    const listDetails = vi.fn(async () => [
      {
        log: {
          id: 'notification-1',
          sourceType: 'test',
          status: 'completed' as const,
          createdAt: '2026-08-25T00:00:00.000Z',
          updatedAt: '2026-08-25T00:00:01.000Z',
        },
        deliveries: [],
      },
    ]);
    const router = await localizedRouter({
      logs: { listDetails, get: vi.fn(async () => undefined) },
    });

    const response = await router.request('/logs');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: await listDetails() });
  });

  it('returns one log or a not-found response', async () => {
    const details = {
      log: {
        id: 'notification-1',
        sourceType: 'test',
        status: 'completed' as const,
        createdAt: '2026-08-25T00:00:00.000Z',
        updatedAt: '2026-08-25T00:00:01.000Z',
      },
      deliveries: [],
    };
    const get = vi.fn(async (id: string) =>
      id === details.log.id ? details : undefined,
    );
    const router = await localizedRouter({
      logs: { listDetails: vi.fn(async () => []), get },
    });

    const found = await router.request('/logs/notification-1');
    const missing = await router.request('/logs/missing');

    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ data: details });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: {
        code: 'NOTIFICATION_LOG_NOT_FOUND',
        message: 'Notification log not found.',
        ns: NOTIFICATION_NAMESPACE,
        key: 'errors.logNotFound',
      },
    });
  });
});

async function localizedRouter(
  options: Parameters<typeof createNotificationRouter>[0],
): Promise<Hono> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerNamespace(NOTIFICATION_NAMESPACE, notificationServerLocales);
  await runtime.init();
  const router = new Hono();
  router.use('*', createI18nMiddleware(runtime));
  router.route('/', createNotificationRouter(options));
  return router;
}
