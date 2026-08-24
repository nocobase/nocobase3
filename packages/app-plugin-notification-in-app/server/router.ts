import type {
  NocoBaseSession,
  SessionData,
  SessionEnv,
} from '@nocobase/session';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { InAppStore } from './store.js';

export type InAppUserIdResolver = (
  request: Request,
) => Promise<string | undefined>;

export interface CreateInAppRouterOptions {
  readonly resolveUserId?: InAppUserIdResolver;
}

type InAppRouterEnv = {
  Variables: SessionEnv['Variables'] & { notificationUserId: string };
};

export function createInAppRouter(
  store: InAppStore,
  options: CreateInAppRouterOptions = {},
): Hono<InAppRouterEnv> {
  const router = new Hono<InAppRouterEnv>();
  router.use('*', async (context, next) => {
    const externalUserId = await options.resolveUserId?.(context.req.raw);
    if (externalUserId && context.var.session) {
      await context.var.session.set('userId', externalUserId);
    }
    const resolvedUserId =
      externalUserId ?? (await userId(context.var.session));
    if (!resolvedUserId)
      return context.json({ error: 'Authentication required.' }, 401);
    context.set('notificationUserId', resolvedUserId);
    await next();
  });
  router.get('/csrf', (context) => {
    const token = crypto.randomUUID();
    setCookie(context, 'notification_in_app_csrf', token, {
      httpOnly: false,
      sameSite: 'Strict',
      path: '/',
    });
    return context.json({ token });
  });
  router.get('/', async (context) =>
    context.json({
      data: await store.list({
        userId: context.var.notificationUserId,
        unreadOnly: context.req.query('unreadOnly') === 'true',
        limit: Number(context.req.query('limit') ?? 25),
      }),
    }),
  );
  router.get('/unread-count', async (context) =>
    context.json({
      count: await store.countUnread(context.var.notificationUserId),
    }),
  );
  router.post('/read-all', async (context) => {
    if (
      !validCsrf(
        context.req.header('x-csrf-token'),
        getCookie(context, 'notification_in_app_csrf'),
      )
    )
      return context.json({ error: 'Invalid CSRF token.' }, 403);
    return context.json({
      updated: await store.markAllRead(context.var.notificationUserId),
    });
  });
  router.post('/:id', async (context) => {
    if (
      !validCsrf(
        context.req.header('x-csrf-token'),
        getCookie(context, 'notification_in_app_csrf'),
      )
    )
      return context.json({ error: 'Invalid CSRF token.' }, 403);
    const body = await context.req.json<{
      action?: 'read' | 'unread' | 'delete';
      expectedVersion?: number;
    }>();
    const updated = await store.update({
      id: context.req.param('id'),
      userId: context.var.notificationUserId,
      action: body.action ?? 'read',
      expectedVersion: body.expectedVersion ?? 0,
    });
    return updated
      ? context.json({ data: updated })
      : context.json({ error: 'Not found or version conflict.' }, 409);
  });
  return router;
}
async function userId(
  session: NocoBaseSession | undefined,
): Promise<string | undefined> {
  const data = await session?.get();
  return data ? sessionUser(data) : undefined;
}
function sessionUser(data: SessionData): string | undefined {
  const value =
    data.userId ??
    (data.user && typeof data.user === 'object' && 'id' in data.user
      ? data.user.id
      : undefined);
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : undefined;
}
function validCsrf(
  header: string | undefined,
  cookie: string | undefined,
): boolean {
  return Boolean(header && cookie && header === cookie);
}
