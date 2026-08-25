import { Hono } from 'hono';

import type { NotificationManager } from '@nocobase/notification';

import type { AppNotificationChannels } from '../../services/index.js';

export type NotificationTestSender = Pick<
  NotificationManager<AppNotificationChannels>,
  'logs' | 'send'
>;

export interface NotificationRouteOptions {
  notification?: NotificationTestSender;
}

export function createNotificationRoutes({
  notification,
}: NotificationRouteOptions): Hono {
  const routes = new Hono();

  routes.get('/logs', async (context) => {
    if (!notification)
      return context.json({ error: 'Notifications are not configured.' }, 503);
    return context.json({ data: await notification.logs.listDetails() });
  });

  routes.get('/logs/:id', async (context) => {
    if (!notification)
      return context.json({ error: 'Notifications are not configured.' }, 503);
    const details = await notification.logs.get(context.req.param('id'));
    return details
      ? context.json({ data: details })
      : context.json({ error: 'Notification log not found.' }, 404);
  });

  routes.post('/test/email', async (context) => {
    if (!notification)
      return context.json({ error: 'Notifications are not configured.' }, 503);
    const input = normalizeEmailInput(await requestBody(context.req.raw));
    if (!input)
      return context.json(
        { error: 'Addresses, subject, and text are required.' },
        400,
      );
    const result = await notification.send({
      source: { type: 'notification-test' },
      to: input.addresses.map((address) => ({
        type: 'email' as const,
        address,
      })),
      channels: ['email'],
      content: { title: input.subject, body: input.text },
    });
    return context.json({ data: result }, 202);
  });

  routes.post('/test/in-app', async (context) => {
    if (!notification)
      return context.json({ error: 'Notifications are not configured.' }, 503);
    const input = normalizeInAppInput(await requestBody(context.req.raw));
    if (!input)
      return context.json({ error: 'User IDs and body are required.' }, 400);
    const result = await notification.send({
      source: { type: 'notification-test' },
      to: input.userIds.map((id) => ({ type: 'user' as const, id })),
      channels: ['in-app'],
      content: {
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl,
      },
    });
    return context.json({ data: result }, 202);
  });

  return routes;
}

interface EmailInput {
  readonly addresses: readonly string[];
  readonly subject: string;
  readonly text: string;
}

interface InAppInput {
  readonly userIds: readonly string[];
  readonly title?: string;
  readonly body: string;
  readonly actionUrl?: string;
}

async function requestBody(request: Request): Promise<unknown> {
  return request.json().catch(() => undefined);
}

function normalizeEmailInput(value: unknown): EmailInput | undefined {
  if (!isRecord(value)) return undefined;
  const addresses = stringList(value.addresses);
  if (!addresses || !nonEmpty(value.subject) || !nonEmpty(value.text))
    return undefined;
  return { addresses, subject: value.subject, text: value.text };
}

function normalizeInAppInput(value: unknown): InAppInput | undefined {
  if (!isRecord(value)) return undefined;
  const userIds = stringList(value.userIds);
  if (
    !userIds ||
    !nonEmpty(value.body) ||
    !optionalString(value.title) ||
    !optionalString(value.actionUrl)
  )
    return undefined;
  return {
    userIds,
    title: value.title,
    body: value.body,
    actionUrl: value.actionUrl,
  };
}

function stringList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))
    return undefined;
  const items = [...new Set(value.map((item) => item.trim()))].filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
