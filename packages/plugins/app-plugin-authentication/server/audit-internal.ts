import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context, MiddlewareHandler } from 'hono';
import type { Auth } from './auth.js';
import type {
  AuthenticationAuditBridge,
  AuthenticationAuditDeclaration,
} from './audit.js';

const bridges = new WeakMap<
  Auth,
  () => AuthenticationAuditBridge | undefined
>();
const attempts = new AsyncLocalStorage<{ userId?: string }>();

export function attachAuthenticationAudit(
  auth: Auth,
  resolve: () => AuthenticationAuditBridge | undefined,
): void {
  bridges.set(auth, resolve);
}

export function captureAuthenticatedUser(userId: string): void {
  const attempt = attempts.getStore();
  if (attempt) attempt.userId = userId;
}

export function declareAudit(
  auth: Auth,
  declaration: AuthenticationAuditDeclaration,
): MiddlewareHandler {
  return async (context, next) => {
    const bridge = bridges.get(auth)?.();
    if (bridge) await bridge.collector.http(declaration)(context, next);
    else await next();
  };
}

export function withAuditIdentity<T>(
  auth: Auth,
  context: Context,
  userId: string | undefined,
  callback: () => T,
): T {
  const bridge = bridges.get(auth)?.();
  if (!bridge) return callback();
  const run = (): T => {
    bridge.collector.captureScope(context);
    return callback();
  };
  return userId
    ? bridge.runtime.runAuthenticated(
        { actor: { type: 'user', id: userId } },
        run,
      )
    : bridge.runtime.runAnonymous(run);
}

export async function handleAuditedAuthentication(
  auth: Auth,
  context: Context,
): Promise<Response> {
  if (!bridges.get(auth)?.()) return auth.handler(context.req.raw);
  const path = context.req.path;
  const signingIn =
    path.endsWith('/sign-in/email') ||
    path.endsWith('/sign-in/username') ||
    path.endsWith('/sign-up/email');
  const before = signingIn
    ? null
    : await auth.getSession(context.req.raw.headers);
  return withAuditIdentity(auth, context, before?.user.id, () =>
    attempts.run({}, async () => {
      const response = await auth.handler(context.req.raw);
      const userId = attempts.getStore()?.userId;
      if (
        signingIn &&
        response.status >= 200 &&
        response.status < 300 &&
        userId
      ) {
        withAuditIdentity(auth, context, userId, () => undefined);
      }
      return response;
    }),
  );
}
