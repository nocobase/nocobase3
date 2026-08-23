import { Hono } from 'hono';

import type { Auth } from '@nocobase/app-plugin-authentication';

/** Better Auth owns the complete /api/auth protocol surface. */
export function createAuthRoutes(auth: Auth): Hono {
  const routes = new Hono();
  routes.on(['GET', 'POST'], '/*', (context) => auth.handler(context.req.raw));
  return routes;
}
