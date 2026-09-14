import { Hono } from 'hono';
import { AuthorizationDeniedError } from '../../core/index.js';
import type { AuthorizationRouteRequest } from '../../core/index.js';

export interface SettingsRouterEnv {
  Bindings: {
    authorization: AuthorizationRouteRequest['authorization'];
  };
}

/**
 * A router for one Authorization settings surface. Denied requests answer
 * `403 FORBIDDEN` and malformed bodies `400 INVALID_AUTHORIZATION_INPUT`.
 */
export function createSettingsRouter(): Hono<SettingsRouterEnv> {
  const routes = new Hono<SettingsRouterEnv>();
  routes.onError((error, context) => {
    if (error instanceof AuthorizationDeniedError)
      return context.json({ code: 'FORBIDDEN', message: error.message }, 403);
    if (error instanceof TypeError)
      return context.json(
        { code: 'INVALID_AUTHORIZATION_INPUT', message: error.message },
        400,
      );
    throw error;
  });
  return routes;
}

export function requireSettings(
  authorization: AuthorizationRouteRequest['authorization'],
  settings: string,
  action: string,
): Promise<void> {
  return authorization.require({
    resource: { type: 'authorization.settings', id: settings },
    action,
  });
}

export function createRouteHandler(
  routes: Hono<SettingsRouterEnv>,
): (input: AuthorizationRouteRequest) => Promise<Response> {
  return (input) =>
    Promise.resolve(
      routes.fetch(atPath(input.request, input.path), {
        authorization: input.authorization,
      }),
    );
}

/** The request as the plugin's own router sees it: mounted at the root. */
export function atPath(request: Request, path: string): Request {
  const url = new URL(request.url);
  if (url.pathname === path) return request;
  url.pathname = path;
  return new Request(url, request);
}
