import { Hono } from 'hono';

import type { NotificationLogs } from './logs.js';

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
      : context.json({ error: 'Notification log not found.' }, 404);
  });

  return router;
}
