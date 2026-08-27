import { Hono } from 'hono';

import type { NativeAuthRuntime } from './runtime.js';

export function createNativeAuthRoutes(auth: NativeAuthRuntime): Hono {
  const routes = new Hono();
  routes.on(['GET', 'POST'], '/*', (context) => auth.handle(context.req.raw));
  return routes;
}
