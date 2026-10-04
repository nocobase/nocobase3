import type { AuthSession } from '@nocobase/app-plugin-authentication';
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
    const router = await localizedRouter(store, signedInAs('user-1'));

    const response = await router.request('/messages');

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

  it('returns a stable page token and accepts it for the next page', async () => {
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

    const firstResponse = await router.request('/messages?pageSize=2');
    const first = (await firstResponse.json()) as {
      readonly data: readonly { readonly id: string }[];
      readonly meta: { readonly nextPageToken: string };
    };
    const secondResponse = await router.request(
      `/messages?pageSize=2&pageToken=${encodeURIComponent(first.meta.nextPageToken)}`,
    );
    const second = (await secondResponse.json()) as {
      readonly data: readonly { readonly id: string }[];
      readonly meta: { readonly nextPageToken?: string };
    };

    expect(first.data).toHaveLength(2);
    expect(first.meta.nextPageToken).toEqual(expect.any(String));
    expect(second.data).toHaveLength(1);
    expect(second.meta.nextPageToken).toBeUndefined();
    expect(second.data[0]?.id).not.toBe(first.data[0]?.id);
    expect(second.data[0]?.id).not.toBe(first.data[1]?.id);
  });

  it.each(['0', '-1', '1.5', 'NaN', '101', '9007199254740992'])(
    'rejects invalid pageSize %s',
    async (pageSize) => {
      const router = await authenticatedRouter(new MemoryInAppStore());
      const response = await router.request(
        `/messages?pageSize=${encodeURIComponent(pageSize)}`,
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          status: 'INVALID_ARGUMENT',
          reason: 'INVALID_INPUT',
          fieldViolations: expect.arrayContaining([
            expect.objectContaining({ field: 'pageSize' }),
          ]),
        },
      });
    },
  );

  it('rejects an invalid page token', async () => {
    const router = await authenticatedRouter(new MemoryInAppStore());
    const response = await router.request('/messages?pageToken=not-a-token');
    const nonCanonicalToken = Buffer.from(
      JSON.stringify({ createdAt: '2026-08-26T08:00:00+08:00', id: 'item-1' }),
    ).toString('base64url');
    const nonCanonicalResponse = await router.request(
      `/messages?pageToken=${nonCanonicalToken}`,
    );

    const expected = {
      error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        reason: 'IN_APP_NOTIFICATION_INVALID_PAGE_TOKEN',
        domain: 'notificationInApp',
        message: 'pageToken is not a token this list returned.',
        localizedMessage: {
          locale: 'en-US',
          message: 'pageToken is not a token this list returned.',
        },
        fieldViolations: [
          {
            field: 'pageToken',
            description: 'pageToken is not a token this list returned.',
          },
        ],
        requestId: expect.any(String),
      },
    };
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expected);
    expect(nonCanonicalResponse.status).toBe(400);
    expect(await nonCanonicalResponse.json()).toEqual(expected);
  });

  it('marks messages read and unread, counts unread, and deletes, all behind the CSRF token', async () => {
    const store = new MemoryInAppStore();
    const delivered = await store.deliver({
      deliveryId: 'delivery-1',
      notificationId: 'notification-1',
      userId: 'user-1',
      message: { body: 'Message' },
      createdAt: '2026-08-26T00:00:00.000Z',
    });
    const router = await authenticatedRouter(store);
    const headers = await csrfHeaders(router);
    const unreadCount = async (): Promise<unknown> =>
      (await router.request('/messages/unreadCount')).json();

    await expect(unreadCount()).resolves.toEqual({ data: { count: 1 } });

    const read = await router.request(`/messages/${delivered.id}/markRead`, {
      method: 'POST',
      headers,
    });
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toMatchObject({
      data: { id: delivered.id, readAt: expect.any(String) },
    });
    await expect(unreadCount()).resolves.toEqual({ data: { count: 0 } });

    const unread = await router.request(
      `/messages/${delivered.id}/markUnread`,
      { method: 'POST', headers },
    );
    expect(unread.status).toBe(200);
    await expect(unreadCount()).resolves.toEqual({ data: { count: 1 } });

    const allRead = await router.request('/messages/markAllRead', {
      method: 'POST',
      headers,
    });
    await expect(allRead.json()).resolves.toEqual({ data: { updated: 1 } });

    const deleted = await router.request(`/messages/${delivered.id}`, {
      method: 'DELETE',
      headers,
    });
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe('');
    expect(await store.list({ userId: 'user-1', limit: 10 })).toEqual([]);
  });

  it('returns a csrf token in the standard body and sets the matching cookie', async () => {
    const router = await authenticatedRouter(new MemoryInAppStore());
    const response = await router.request('/csrfToken');
    const body = (await response.json()) as {
      readonly data: { readonly token: string };
    };

    expect(body.data.token).toEqual(expect.any(String));
    expect(response.headers.get('set-cookie')).toContain(
      `notification_in_app_csrf=${body.data.token}`,
    );
  });

  it('returns stable errors for invalid CSRF and missing items', async () => {
    const router = await authenticatedRouter(new MemoryInAppStore());

    const invalidCsrf = await router.request('/messages/markAllRead', {
      method: 'POST',
      headers: { 'accept-language': 'zh-CN' },
    });

    expect(invalidCsrf.status).toBe(403);
    await expect(invalidCsrf.json()).resolves.toEqual({
      error: {
        code: 403,
        status: 'PERMISSION_DENIED',
        reason: 'IN_APP_NOTIFICATION_INVALID_CSRF',
        domain: 'notificationInApp',
        message: 'Invalid CSRF token.',
        localizedMessage: { locale: 'zh-CN', message: 'CSRF token 无效。' },
        requestId: expect.any(String),
      },
    });

    const headers = await csrfHeaders(router);
    for (const [path, method] of [
      ['/messages/missing/markRead', 'POST'],
      ['/messages/missing/markUnread', 'POST'],
      ['/messages/missing', 'DELETE'],
    ] as const) {
      const missing = await router.request(path, { method, headers });
      expect(missing.status).toBe(404);
      await expect(missing.json()).resolves.toMatchObject({
        error: {
          status: 'NOT_FOUND',
          reason: 'IN_APP_NOTIFICATION_NOT_FOUND',
          domain: 'notificationInApp',
        },
      });
    }
  });

  it('answers UNAUTHENTICATED when the authentication middleware sets no user', async () => {
    const router = await localizedRouter(
      new MemoryInAppStore(),
      signedInAs(undefined),
    );

    const response = await router.request('/messages');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        status: 'UNAUTHENTICATED',
        reason: 'IN_APP_NOTIFICATION_AUTHENTICATION_REQUIRED',
        domain: 'notificationInApp',
      },
    });
  });

  it('reuses a valid CSRF cookie instead of rotating it on every GET', async () => {
    const router = await authenticatedRouter(new MemoryInAppStore());
    const first = await router.request('/csrfToken');
    const token = (
      (await first.json()) as { readonly data: { readonly token: string } }
    ).data.token;
    const cookie = first.headers.get('set-cookie')?.split(';')[0] ?? '';

    const second = await router.request('/csrfToken', { headers: { cookie } });

    expect(second.headers.get('set-cookie')).toBeNull();
    await expect(second.json()).resolves.toEqual({ data: { token } });
    const write = await router.request('/messages/markAllRead', {
      method: 'POST',
      headers: { cookie, 'x-csrf-token': token },
    });
    expect(write.status).toBe(200);
  });

  it('replaces a malformed CSRF cookie and still rejects a mismatched header', async () => {
    const router = await authenticatedRouter(new MemoryInAppStore());

    const response = await router.request('/csrfToken', {
      headers: { cookie: 'notification_in_app_csrf=attacker-chosen' },
    });
    const token = (
      (await response.json()) as { readonly data: { readonly token: string } }
    ).data.token;

    expect(token).not.toBe('attacker-chosen');
    expect(response.headers.get('set-cookie')).toContain(
      `notification_in_app_csrf=${token}`,
    );
    const mismatched = await router.request('/messages/markAllRead', {
      method: 'POST',
      headers: {
        cookie: `notification_in_app_csrf=${token}`,
        'x-csrf-token': crypto.randomUUID(),
      },
    });
    expect(mismatched.status).toBe(403);
  });
});

async function csrfHeaders(router: Hono): Promise<Record<string, string>> {
  const csrf = await router.request('/csrfToken');
  const token = (
    (await csrf.json()) as { readonly data: { readonly token: string } }
  ).data.token;
  const cookie = csrf.headers.get('set-cookie')?.split(';')[0];
  return { cookie: cookie ?? '', 'x-csrf-token': token };
}

function authenticatedRouter(store: MemoryInAppStore): Promise<Hono> {
  return localizedRouter(store, signedInAs('user-1'));
}

/** Stands in for the authentication plugin's `auth.required()`, which sets `auth` before the inbox runs. */
function signedInAs(
  userId: string | undefined,
): Parameters<typeof createInAppRouter>[1] {
  return {
    authenticate: async (context, next) => {
      context.set(
        'auth',
        userId ? ({ user: { id: userId } } as unknown as AuthSession) : null,
      );
      await next();
    },
  };
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
