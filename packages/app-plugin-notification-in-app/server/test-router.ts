import type { NotificationManager } from '@nocobase/app-plugin-notification';
import { Hono } from 'hono';

import type { InAppMessage, InAppRecipient } from './types.js';

interface InAppTestChannels {
  readonly 'in-app': {
    readonly recipient: InAppRecipient;
    readonly message: InAppMessage;
  };
}

export type InAppTestSender = Pick<
  NotificationManager<InAppTestChannels>,
  'send'
>;

export function createInAppTestRouter(sender: InAppTestSender): Hono {
  const router = new Hono();

  router.post('/in-app', async (context) => {
    const input = normalizeInAppInput(await requestBody(context.req.raw));
    if (!input)
      return context.json({ error: 'User IDs and body are required.' }, 400);
    const result = await sender.send({
      source: { type: 'notification-test' },
      to: input.userIds.map((id) => ({ type: 'user', id })),
      channels: ['in-app'],
      content: {
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl,
      },
    });
    return context.json({ data: result }, 202);
  });

  return router;
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
