import type { AuthorizationScope } from './authorization.js';

export interface AuthorizationRouteRequest {
  request: Request;
  /** The request path relative to where the application mounted the dispatcher. */
  path: string;
  authorization: Pick<AuthorizationScope, 'require'>;
}

export type AuthorizationRouteHandler = (
  input: AuthorizationRouteRequest,
) => Promise<Response>;

/**
 * The HTTP surface the installed plugins contribute. A plugin registers its
 * own routes during setup, so an application mounts one dispatcher instead of
 * naming each plugin, and a plugin it did not install has no route at all.
 */
export class AuthorizationRouteRegistry {
  private readonly handlers = new Map<string, AuthorizationRouteHandler>();

  add(path: string, handler: AuthorizationRouteHandler): void {
    const normalized = normalizePath(path);
    if (this.handlers.has(normalized)) {
      throw new Error(`Authorization route already registered: ${normalized}`);
    }
    this.handlers.set(normalized, handler);
  }

  list(): readonly string[] {
    return [...this.handlers.keys()].sort();
  }

  /** The matching handler's response, or `undefined` when no plugin claims the path. */
  handle(input: AuthorizationRouteRequest): Promise<Response> | undefined {
    for (const [route, handler] of this.handlers) {
      if (input.path === route || input.path.startsWith(`${route}/`)) {
        return handler(input);
      }
    }
    return undefined;
  }
}

function normalizePath(path: string): string {
  return `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '');
}
