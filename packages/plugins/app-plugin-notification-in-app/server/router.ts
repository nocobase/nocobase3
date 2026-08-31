import type {
  NocoBaseSession,
  SessionData,
  SessionEnv,
} from '@nocobase/session';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { InAppStore } from './store.js';
import type { InAppItem } from './types.js';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_CURSOR_LENGTH = 2_048;
const INBOX_ACTIONS = ['read', 'unread', 'delete'] as const;
type InboxAction = (typeof INBOX_ACTIONS)[number];

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
  router.get('/', async (context) => {
    const limit = parseLimit(context.req.query('limit'));
    if (limit === undefined)
      return context.json(
        { error: `limit must be an integer between 1 and ${MAX_PAGE_SIZE}.` },
        400,
      );
    const cursorValue = context.req.query('cursor');
    const before = parseCursor(cursorValue);
    if (cursorValue && !before)
      return context.json({ error: 'cursor is invalid.' }, 400);
    const rows = await store.list({
      userId: context.var.notificationUserId,
      unreadOnly: context.req.query('unreadOnly') === 'true',
      limit: limit + 1,
      before,
    });
    const data = rows.slice(0, limit);
    return context.json({
      data,
      nextCursor:
        rows.length > limit && data.length > 0
          ? encodeCursor(data[data.length - 1])
          : undefined,
    });
  });
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
    const body: unknown = await context.req.json().catch(() => undefined);
    if (!isRecord(body))
      return context.json(
        { error: 'Request body must be a JSON object.' },
        400,
      );
    const action = body.action ?? 'read';
    if (!isInboxAction(action))
      return context.json(
        { error: 'action must be read, unread, or delete.' },
        400,
      );
    const updated = await store.update({
      id: context.req.param('id'),
      userId: context.var.notificationUserId,
      action,
    });
    return updated
      ? context.json({ data: updated })
      : context.json({ error: 'Not found.' }, 404);
  });
  return router;
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (!/^\d+$/.test(value)) return undefined;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_PAGE_SIZE
    ? limit
    : undefined;
}

function encodeCursor(item: InAppItem): string {
  return Buffer.from(
    JSON.stringify({ createdAt: item.createdAt, id: item.id }),
  ).toString('base64url');
}

function parseCursor(
  value: string | undefined,
): { readonly createdAt: string; readonly id: string } | undefined {
  if (!value || value.length > MAX_CURSOR_LENGTH) return undefined;
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

function isInboxAction(value: unknown): value is InboxAction {
  return INBOX_ACTIONS.some((action) => action === value);
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
