import { randomUUID, timingSafeEqual } from 'node:crypto';

import type { NocoBaseSession, SessionData, SessionEnv } from '@nocobase/session';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

import type {
  NotificationChannel,
  NotificationStore,
  UserNotificationItemRecord,
} from './domain.js';

const csrfCookieName = 'notification_inbox_csrf';
const supportedChannels = new Set<NotificationChannel>(['in-app', 'email']);

export interface NotificationInboxRouteOptions {
  readonly store: NotificationStore;
}

export interface InboxItemDto {
  readonly id: string;
  readonly deliveryId: string;
  readonly notificationId: string;
  readonly channel: NotificationChannel;
  readonly title: string;
  readonly body: string;
  readonly actionUrl?: string;
  readonly readAt?: string;
  readonly createdAt: string;
  readonly version: number;
}

export interface InboxListDto {
  readonly data: readonly InboxItemDto[];
  readonly nextCursor?: string;
}

interface InboxCursor {
  readonly createdAt: string;
  readonly id: string;
}

export function createNotificationInboxRouter(
  options: NotificationInboxRouteOptions,
): Hono<SessionEnv> {
  const router = new Hono<SessionEnv>();

  router.use('*', async (context, next): Promise<Response | void> => {
    const userId = await resolvePrincipal(context.var.session);
    if (!userId) {
      return context.json(
        { error: { code: 'NOTIFICATION_INBOX_UNAUTHENTICATED', message: 'Authentication is required.' } },
        401,
      );
    }
    await next();
  });

  router.get('/csrf', (context) => {
    const token = randomUUID();
    const requestUrl = new URL(context.req.url);
    setCookie(context, csrfCookieName, token, {
      httpOnly: false,
      sameSite: 'Strict',
      secure: requestUrl.protocol === 'https:',
      path: '/',
    });
    return context.json({ token });
  });

  router.get('/', async (context) => {
    const parsed = parseListQuery(context.req.query());
    if ('error' in parsed) return context.json({ error: parsed.error }, 400);
    const userId = (await resolvePrincipal(context.var.session))!;
    const records = await options.store.listInbox({
      userId,
      channel: parsed.channel,
      unreadOnly: parsed.unreadOnly,
      limit: parsed.limit,
      beforeCreatedAt: parsed.cursor?.createdAt,
      beforeId: parsed.cursor?.id,
    });
    const data = await Promise.all(records.map((record) => toInboxItemDto(options.store, record)));
    const last = records.at(-1);
    return context.json({
      data,
      nextCursor:
        records.length === parsed.limit && last
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : undefined,
    } satisfies InboxListDto);
  });

  router.get('/unread-count', async (context) => {
    const channel = parseChannel(context.req.query('channel'));
    if (context.req.query('channel') && !channel) {
      return context.json(
        { error: { code: 'NOTIFICATION_INBOX_QUERY_INVALID', message: 'channel must be in-app or email.' } },
        400,
      );
    }
    const userId = (await resolvePrincipal(context.var.session))!;
    return context.json({ count: await options.store.countUnread({ userId, channel }) });
  });

  router.post('/read-all', async (context) => {
    const csrfError = verifyCsrf(context.req.raw, getCookie(context, csrfCookieName));
    if (csrfError) return context.json({ error: csrfError }, 403);
    const body = await readJsonObject(context.req.raw);
    const channelValue = stringValue(body.channel);
    const channel = parseChannel(channelValue);
    if (channelValue && !channel) {
      return context.json(
        { error: { code: 'NOTIFICATION_INBOX_MUTATION_INVALID', message: 'channel must be in-app or email.' } },
        400,
      );
    }
    const userId = (await resolvePrincipal(context.var.session))!;
    const updated = await options.store.markInboxRead({ userId, channel, changedAt: await options.store.now() });
    return context.json({ updated });
  });

  router.post('/:itemId', async (context) => {
    const csrfError = verifyCsrf(context.req.raw, getCookie(context, csrfCookieName));
    if (csrfError) return context.json({ error: csrfError }, 403);
    const body = await readJsonObject(context.req.raw);
    const action = body.action;
    const expectedVersion = positiveInteger(body.expectedVersion);
    if ((action !== 'read' && action !== 'unread' && action !== 'delete') || !expectedVersion) {
      return context.json(
        {
          error: {
            code: 'NOTIFICATION_INBOX_MUTATION_INVALID',
            message: 'action and a positive expectedVersion are required.',
          },
        },
        400,
      );
    }
    const userId = (await resolvePrincipal(context.var.session))!;
    const current = await options.store.getInboxItem(context.req.param('itemId'), userId);
    if (!current) {
      return context.json(
        { error: { code: 'NOTIFICATION_INBOX_ITEM_NOT_FOUND', message: 'Inbox item not found.' } },
        404,
      );
    }
    if (current.version !== expectedVersion) {
      return context.json(
        { error: { code: 'NOTIFICATION_INBOX_CONFLICT', message: 'The item version has changed.' } },
        409,
      );
    }
    const updated = await options.store.updateInboxItem({
      itemId: context.req.param('itemId'),
      userId,
      action,
      expectedVersion,
      changedAt: await options.store.now(),
    });
    if (!updated) {
      return context.json(
        {
          error: {
            code: 'NOTIFICATION_INBOX_CONFLICT',
            message: 'The item version has changed.',
          },
        },
        409,
      );
    }
    return context.json({ data: await toInboxItemDto(options.store, updated) });
  });

  return router;
}

async function toInboxItemDto(
  store: NotificationStore,
  record: UserNotificationItemRecord,
): Promise<InboxItemDto> {
  const delivery = await store.getDelivery(record.deliveryId);
  const content = delivery?.contentSnapshot ?? {};
  return {
    id: record.id,
    deliveryId: record.deliveryId,
    notificationId: record.notificationId,
    channel: record.channel,
    title: stringValue(content.title) ?? stringValue(content.subject) ?? 'Notification',
    body: stringValue(content.body) ?? stringValue(content.text) ?? '',
    actionUrl: safeActionUrl(content.actionUrl),
    readAt: record.readAt,
    createdAt: record.createdAt,
    version: record.version,
  };
}

function safeActionUrl(value: unknown): string | undefined {
  const url = stringValue(value);
  return url && url.startsWith('/') && !url.startsWith('//') ? url : undefined;
}

function parseListQuery(query: Record<string, string>):
  | {
      readonly channel?: NotificationChannel;
      readonly unreadOnly: boolean;
      readonly limit: number;
      readonly cursor?: InboxCursor;
    }
  | { readonly error: { readonly code: string; readonly message: string } } {
  const channel = parseChannel(query.channel);
  const limit = query.limit === undefined ? 25 : positiveInteger(query.limit);
  const unreadOnly = query.unreadOnly === 'true';
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
  if (
    (query.channel && !channel) ||
    !limit ||
    limit > 100 ||
    (query.unreadOnly !== undefined && query.unreadOnly !== 'true' && query.unreadOnly !== 'false') ||
    (query.cursor && !cursor)
  ) {
    return {
      error: {
        code: 'NOTIFICATION_INBOX_QUERY_INVALID',
        message: 'Use a valid channel, boolean unreadOnly, limit from 1 to 100, and cursor.',
      },
    };
  }
  return { channel, unreadOnly, limit, cursor };
}

function parseChannel(value: string | undefined): NotificationChannel | undefined {
  return value && supportedChannels.has(value as NotificationChannel)
    ? (value as NotificationChannel)
    : undefined;
}

function encodeCursor(cursor: InboxCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string): InboxCursor | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      parsed &&
      typeof parsed === 'object' &&
      'createdAt' in parsed &&
      typeof parsed.createdAt === 'string' &&
      !Number.isNaN(Date.parse(parsed.createdAt)) &&
      'id' in parsed &&
      typeof parsed.id === 'string' &&
      parsed.id.length > 0
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function resolvePrincipal(session: NocoBaseSession | undefined): Promise<string | undefined> {
  const data = await session?.get();
  return data ? resolveSessionUserId(data) : undefined;
}

function resolveSessionUserId(data: SessionData): string | undefined {
  const user = data.user;
  if (user && typeof user === 'object' && 'id' in user && typeof user.id === 'string') return user.id;
  return typeof data.userId === 'string' ? data.userId : undefined;
}

function verifyCsrf(
  request: Request,
  cookieToken: string | undefined,
): { readonly code: string; readonly message: string } | undefined {
  const headerToken = request.headers.get('x-csrf-token') ?? undefined;
  const origin = request.headers.get('origin');
  if (
    !cookieToken ||
    !headerToken ||
    !safeEqual(cookieToken, headerToken) ||
    !origin ||
    new URL(origin).origin !== new URL(request.url).origin
  ) {
    return { code: 'NOTIFICATION_CSRF_INVALID', message: 'A valid same-origin CSRF token is required.' };
  }
  return undefined;
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const value: unknown = await request.json().catch(() => undefined);
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
