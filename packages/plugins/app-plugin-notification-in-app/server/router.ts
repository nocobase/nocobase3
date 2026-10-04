import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import { parseApiInput } from '@nocobase/app-server/router';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { validator } from 'hono/validator';

import {
  inAppNotificationApiError,
  inAppNotificationErrorHandler,
} from './http-errors.js';
import { InboxListQuery, InboxMessageParams } from './routes/schemas.js';
import type { InAppStore } from './store.js';
import type { InAppItem } from './types.js';

const CSRF_COOKIE = 'notification_in_app_csrf';
const CSRF_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface CreateInAppRouterOptions {
  /**
   * Authenticates every inbox request and sets `auth` on the context, answering 401 itself when nobody is signed in.
   * The plugin passes the authentication plugin's `auth.required()`.
   */
  readonly authenticate: MiddlewareHandler<AuthEnv>;
}

type InAppRouterEnv = {
  Variables: AuthEnv['Variables'] & { notificationUserId: string };
};

/**
 * The current user's inbox, mounted at `/notificationInApp`. Fixed segments are registered before `/messages/:messageId`
 * so they are never read as a message id.
 */
export function createInAppRouter(
  store: InAppStore,
  options: CreateInAppRouterOptions,
): Hono<InAppRouterEnv> {
  const router = new Hono<InAppRouterEnv>();
  router.onError(inAppNotificationErrorHandler);
  router.use('*', options.authenticate);
  router.use('*', async (context, next) => {
    // The user comes only from the authenticated session; nothing is read from or written to the NocoBase session.
    const userId = context.get('auth')?.user.id;
    if (!userId)
      throw inAppNotificationApiError(context as Context, {
        status: 'UNAUTHENTICATED',
        reason: 'IN_APP_NOTIFICATION_AUTHENTICATION_REQUIRED',
        key: 'authenticationRequired',
      });
    context.set('notificationUserId', userId);
    await next();
  });
  // Double-submit CSRF: the token is returned and set as a cookie, and every write sends it back as `x-csrf-token`.
  // An existing well-formed token is reused rather than rotated, so a GET does not change state and concurrent tabs keep
  // their tokens valid; only a missing or malformed cookie is replaced.
  router.get('/csrfToken', (context) => {
    const existing = getCookie(context, CSRF_COOKIE);
    if (existing && CSRF_TOKEN_PATTERN.test(existing))
      return context.json({ data: { token: existing } });
    const token = crypto.randomUUID();
    setCookie(context, CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: 'Strict',
      path: '/',
    });
    return context.json({ data: { token } });
  });
  router.get(
    '/messages',
    validator('query', (value) => parseApiInput(InboxListQuery, value)),
    async (context) => {
      const { pageSize, pageToken, unreadOnly } = context.req.valid('query');
      const before =
        pageToken === undefined ? undefined : parsePageToken(pageToken);
      if (pageToken !== undefined && !before)
        throw inAppNotificationApiError(context, {
          status: 'INVALID_ARGUMENT',
          reason: 'IN_APP_NOTIFICATION_INVALID_PAGE_TOKEN',
          key: 'invalidPageToken',
          field: 'pageToken',
        });
      const rows = await store.list({
        userId: context.var.notificationUserId,
        unreadOnly: unreadOnly === 'true',
        limit: pageSize + 1,
        before,
      });
      const data = rows.slice(0, pageSize);
      const last = data.at(-1);
      return context.json({
        data,
        meta:
          rows.length > pageSize && last
            ? { nextPageToken: encodePageToken(last) }
            : {},
      });
    },
  );
  router.get('/messages/unreadCount', async (context) =>
    context.json({
      data: { count: await store.countUnread(context.var.notificationUserId) },
    }),
  );
  router.post('/messages/markAllRead', requireCsrf(), async (context) =>
    context.json({
      data: {
        updated: await store.markAllRead(context.var.notificationUserId),
      },
    }),
  );
  for (const [verb, action] of [
    ['markRead', 'read'],
    ['markUnread', 'unread'],
  ] as const) {
    router.post(
      `/messages/:messageId/${verb}`,
      requireCsrf(),
      validator('param', (value) => parseApiInput(InboxMessageParams, value)),
      async (context) => {
        const { messageId } = context.req.valid('param');
        const updated = await store.update({
          id: messageId,
          userId: context.var.notificationUserId,
          action,
        });
        if (!updated) throw messageNotFound(context);
        return context.json({ data: updated });
      },
    );
  }
  router.delete(
    '/messages/:messageId',
    requireCsrf(),
    validator('param', (value) => parseApiInput(InboxMessageParams, value)),
    async (context) => {
      const { messageId } = context.req.valid('param');
      const deleted = await store.update({
        id: messageId,
        userId: context.var.notificationUserId,
        action: 'delete',
      });
      if (!deleted) throw messageNotFound(context);
      return context.body(null, 204);
    },
  );
  return router;
}

function requireCsrf(): MiddlewareHandler<InAppRouterEnv> {
  return async (context, next) => {
    if (
      !validCsrf(
        context.req.header('x-csrf-token'),
        getCookie(context, CSRF_COOKIE),
      )
    )
      throw inAppNotificationApiError(context as Context, {
        status: 'PERMISSION_DENIED',
        reason: 'IN_APP_NOTIFICATION_INVALID_CSRF',
        key: 'invalidCsrf',
      });
    await next();
  };
}

function messageNotFound(context: Context): Error {
  return inAppNotificationApiError(context, {
    status: 'NOT_FOUND',
    reason: 'IN_APP_NOTIFICATION_NOT_FOUND',
    key: 'notFound',
  });
}

function encodePageToken(item: InAppItem): string {
  return Buffer.from(
    JSON.stringify({ createdAt: item.createdAt, id: item.id }),
  ).toString('base64url');
}

function parsePageToken(
  value: string,
): { readonly createdAt: string; readonly id: string } | undefined {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (
      !isRecord(parsed) ||
      typeof parsed.createdAt !== 'string' ||
      !isCanonicalTimestamp(parsed.createdAt) ||
      typeof parsed.id !== 'string' ||
      parsed.id.length === 0
    )
      return undefined;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return undefined;
  }
}

function isCanonicalTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validCsrf(
  header: string | undefined,
  cookie: string | undefined,
): boolean {
  return Boolean(header && cookie && header === cookie);
}
