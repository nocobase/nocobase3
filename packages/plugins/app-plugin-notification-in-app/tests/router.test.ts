import { I18nRuntime } from '@nocobase/i18n';
import { createI18nMiddleware } from '@nocobase/i18n/server';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import {
  createInAppRouter,
  IN_APP_NOTIFICATION_NAMESPACE,
  inAppNotificationServerLocales,
  MemoryInAppStore,
} from '../server/index.js';

describe('createInAppRouter', () => {
  it("uses the authenticated user and isolates another user's items", async () => {
    const store = new MemoryInAppStore();
    await store.deliver({
      deliveryId: 'delivery-user-1',
      notificationId: 'notification-user-1',
      userId: 'user-1',
      message: { body: 'Visible' },
      createdAt: '2026-08-26T00:00:00.000Z',
    });
    await store.deliver({
      deliveryId: 'delivery-user-2',
      notificationId: 'notification-user-2',
      userId: 'user-2',
      message: { body: 'Hidden' },
      createdAt: '2026-08-26T00:00:01.000Z',
    });
    const router = await localizedRouter(store, {
      resolveUserId: async () => 'user-1',
    });

    const response = await router.request('/');

    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      data: readonly { userId: string; body: string }[];
    };
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      userId: 'user-1',
      body: 'Visible',
    });
  });

  it('returns a stable cursor and accepts it for the next page', async () => {
    const store = new MemoryInAppStore();
    for (let index = 0; index < 3; index++) {
      await store.deliver({
        deliveryId: `delivery-${index}`,
        notificationId: `notification-${index}`,
        userId: 'user-1',
        message: { body: `Message ${index}` },
        createdAt: `2026-08-26T00:00:0${index}.000Z`,
      });
    }
    const router = await authenticatedRouter(store);

    const firstResponse = await router.request('/?limit=2');
    const first = (await firstResponse.json()) as {
      readonly data: readonly { readonly id: string }[];
      readonly nextCursor: string;
    };
    const secondResponse = await router.request(
      `/?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`,
    );
    const second = (await secondResponse.json()) as {
      readonly data: readonly { readonly id: string }[];
    };

    expect(first.data).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(second.data).toHaveLength(1);
    expect(second.data[0]?.id).not.toBe(first.data[0]?.id);
    expect(second.data[0]?.id).not.toBe(first.data[1]?.id);
  });

  it.each(['0', '-1', '1.5', 'NaN', '101', '9007199254740992'])(
    'rejects invalid limit %s',
    async (limit) => {
      const router = await authenticatedRouter(new MemoryInAppStore());
      const response = await router.request(
        `/?limit=${encodeURIComponent(limit)}`,
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: 'IN_APP_NOTIFICATION_INVALID_LIMIT',
          message: 'limit must be an integer between 1 and 100.',
          ns: IN_APP_NOTIFICATION_NAMESPACE,
          key: 'errors.invalidLimit',
          params: { max: 100 },
        },
      });
    },
  );

  it('rejects an invalid cursor', async () => {
    const router = await authenticatedRouter(new MemoryInAppStore());
    const response = await router.request('/?cursor=not-a-cursor');
    const nonCanonicalCursor = Buffer.from(
      JSON.stringify({ createdAt: '2026-08-26T08:00:00+08:00', id: 'item-1' }),
    ).toString('base64url');
    const nonCanonicalResponse = await router.request(
      `/?cursor=${nonCanonicalCursor}`,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'IN_APP_NOTIFICATION_INVALID_CURSOR',
        message: 'cursor is invalid.',
        ns: IN_APP_NOTIFICATION_NAMESPACE,
        key: 'errors.invalidCursor',
      },
    });
    expect(nonCanonicalResponse.status).toBe(400);
    expect(await nonCanonicalResponse.json()).toEqual({
      error: {
        code: 'IN_APP_NOTIFICATION_INVALID_CURSOR',
        message: 'cursor is invalid.',
        ns: IN_APP_NOTIFICATION_NAMESPACE,
        key: 'errors.invalidCursor',
      },
    });
  });

  it('rejects malformed JSON and unknown mutation actions', async () => {
    const store = new MemoryInAppStore();
    const delivered = await store.deliver({
      deliveryId: 'delivery-1',
      notificationId: 'notification-1',
      userId: 'user-1',
      message: { body: 'Message' },
      createdAt: '2026-08-26T00:00:00.000Z',
    });
    const router = await authenticatedRouter(store);
    const csrf = await router.request('/csrf');
    const token = ((await csrf.json()) as { readonly token: string }).token;
    const cookie = csrf.headers.get('set-cookie')?.split(';')[0];
    const headers = {
      cookie: cookie ?? '',
      'content-type': 'application/json',
      'x-csrf-token': token,
    };

    const malformed = await router.request(`/${delivered.id}`, {
      method: 'POST',
      headers,
      body: '{',
    });
    const unknown = await router.request(`/${delivered.id}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'archive' }),
    });

    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({
      error: {
        code: 'IN_APP_NOTIFICATION_INVALID_BODY',
        message: 'Request body must be a JSON object.',
        ns: IN_APP_NOTIFICATION_NAMESPACE,
        key: 'errors.invalidBody',
      },
    });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({
      error: {
        code: 'IN_APP_NOTIFICATION_INVALID_ACTION',
        message: 'action must be read, unread, or delete.',
        ns: IN_APP_NOTIFICATION_NAMESPACE,
        key: 'errors.invalidAction',
      },
    });
    const items = await store.list({ userId: 'user-1', limit: 10 });
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(delivered.id);
    expect(items[0]?.readAt).toBeUndefined();
  });

  it('returns stable errors for invalid CSRF and missing items', async () => {
    const router = await authenticatedRouter(new MemoryInAppStore());

    const invalidCsrf = await router.request('/read-all', { method: 'POST' });

    expect(invalidCsrf.status).toBe(403);
    await expect(invalidCsrf.json()).resolves.toEqual({
      error: {
        code: 'IN_APP_NOTIFICATION_INVALID_CSRF',
        message: 'Invalid CSRF token.',
        ns: IN_APP_NOTIFICATION_NAMESPACE,
        key: 'errors.invalidCsrf',
      },
    });

    const csrf = await router.request('/csrf');
    const token = ((await csrf.json()) as { readonly token: string }).token;
    const cookie = csrf.headers.get('set-cookie')?.split(';')[0];
    const missing = await router.request('/missing', {
      method: 'POST',
      headers: {
        cookie: cookie ?? '',
        'content-type': 'application/json',
        'x-csrf-token': token,
      },
      body: JSON.stringify({ action: 'read' }),
    });

    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({
      error: {
        code: 'IN_APP_NOTIFICATION_NOT_FOUND',
        message: 'Not found.',
        ns: IN_APP_NOTIFICATION_NAMESPACE,
        key: 'errors.notFound',
      },
    });
  });
});

function authenticatedRouter(store: MemoryInAppStore): Promise<Hono> {
  return localizedRouter(store, {
    resolveUserId: async () => 'user-1',
  });
}

async function localizedRouter(
  store: MemoryInAppStore,
  options: Parameters<typeof createInAppRouter>[1],
): Promise<Hono> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerNamespace(
    IN_APP_NOTIFICATION_NAMESPACE,
    inAppNotificationServerLocales,
  );
  await runtime.init();
  const router = new Hono();
  router.use('*', createI18nMiddleware(runtime));
  router.route('/', createInAppRouter(store, options));
  return router;
}
