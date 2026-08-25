import type { NotificationManager } from '@nocobase/app-plugin-notification';
import { Hono } from 'hono';

import type { EmailMessage, EmailRecipient } from './types.js';

interface EmailTestChannels {
  readonly email: {
    readonly recipient: EmailRecipient;
    readonly message: EmailMessage;
  };
}

export type EmailTestSender = Pick<
  NotificationManager<EmailTestChannels>,
  'send'
>;

export function createEmailTestRouter(sender: EmailTestSender): Hono {
  const router = new Hono();

  router.post('/email', async (context) => {
    const input = normalizeEmailInput(await requestBody(context.req.raw));
    if (!input)
      return context.json(
        { error: 'Addresses, subject, and text are required.' },
        400,
      );
    const result = await sender.send({
      source: { type: 'notification-test' },
      to: input.addresses.map((address) => ({ type: 'email', address })),
      channels: ['email'],
      content: { title: input.subject, body: input.text },
    });
    return context.json({ data: result }, 202);
  });

  return router;
}

interface EmailInput {
  readonly addresses: readonly string[];
  readonly subject: string;
  readonly text: string;
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

function stringList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))
    return undefined;
  const items = [...new Set(value.map((item) => item.trim()))].filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
