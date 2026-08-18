import { Hono } from 'hono';

import type { SessionData, SessionEnv } from '@nocobase/session';

type ApiSessionData = SessionData & {
  visits?: number;
  touchedAt?: string;
};

export function createSessionRoutes(): Hono<SessionEnv<ApiSessionData>> {
  const routes = new Hono<SessionEnv<ApiSessionData>>();

  routes.get('/', async (context) => {
    const session = context.var.session;
    if (!session) {
      return context.json({
        enabled: false,
        id: null,
        data: null,
      });
    }

    const data = await session.get();

    return context.json({
      enabled: true,
      id: session.id,
      data,
    });
  });

  routes.post('/touch', async (context) => {
    const session = context.var.session;
    if (!session) {
      return context.json(
        {
          error: 'Session is not enabled.',
        },
        503,
      );
    }

    await session.update((previous) => ({
      ...(previous ?? {}),
      visits: Number(previous?.visits ?? 0) + 1,
      touchedAt: new Date().toISOString(),
    }));

    return context.json({
      enabled: true,
      id: session.id,
      data: await session.get(),
    });
  });

  routes.delete('/', async (context) => {
    const session = context.var.session;
    if (!session) {
      return context.json({
        destroyed: false,
      });
    }

    await session.destroy();

    return context.json({
      destroyed: true,
    });
  });

  return routes;
}
