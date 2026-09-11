import { Hono } from 'hono';
import { getRequestTranslator } from '@nocobase/i18n/server';

import { notificationErrorBody } from './http-errors.js';
import type { NotificationLogs } from './logs.js';
import { NOTIFICATION_NAMESPACE } from './types.js';

export interface NotificationRouterOptions {
  readonly logs: Pick<NotificationLogs, 'get' | 'listDetails'>;
}

export function createNotificationRouter({
  logs,
}: NotificationRouterOptions): Hono {
  const router = new Hono();

  router.get('/logs', async (context) =>
    context.json({ data: await logs.listDetails() }),
  );

  router.get('/logs/:id', async (context) => {
    const details = await logs.get(context.req.param('id'));
    return details
      ? context.json({ data: details })
      : context.json(
          notificationErrorBody(
            getRequestTranslator(context, NOTIFICATION_NAMESPACE),
            'NOTIFICATION_LOG_NOT_FOUND',
            'errors.logNotFound',
            'Notification log not found.',
          ),
          404,
        );
  });

  return router;
}
