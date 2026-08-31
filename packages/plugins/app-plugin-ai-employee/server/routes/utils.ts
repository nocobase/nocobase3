import type { Auth } from '@nocobase/app-plugin-authentication';
import type { CurrentUser } from '../context.js';
import type { Context as HonoContext, MiddlewareHandler } from 'hono';
import type { Context as AppContext, StreamTarget } from '../context.js';
import { waitForPluginReady } from '../runtime.js';
import { AI_API_BASE_PATH } from './contracts.js';
import { SSEStreamTarget, sseResponseHeaders } from './sse.js';

export function createAICurrentUserMiddleware(auth: Auth): MiddlewareHandler {
  return async (context, next) => {
    context.set(
      'currentUser',
      await resolveAuthenticatedUser(auth, context.req.raw),
    );
    await next();
  };
}

export function createAIRequestMiddleware(): MiddlewareHandler {
  return async (context, next) => {
    const ctx = context.var.ctx as AppContext;
    const action = actionFromPath(context.req.path);

    try {
      await waitForPluginReady();
      const currentUser = ctx.currentUser;
      ctx.logger?.info?.({ action, userId: currentUser.id }, 'AI local action');
      await next();
      context.header('x-local-ai', '1');
    } catch (error: unknown) {
      ctx.logger?.error?.({ action, error }, 'AI local action failed');
      return errorResponse(error);
    }
  };
}

export function createAISSEStreamResponse(
  context: HonoContext,
  action: string,
  handler: (target: SSEStreamTarget) => unknown | Promise<unknown>,
): Response {
  const target = new SSEStreamTarget();
  const request = context.req.raw;
  const ctx = context.var.ctx as AppContext;

  void runSSEAction(ctx, action, target, () => handler(target));
  request.signal.addEventListener('abort', () => target.end(), { once: true });

  return new Response(target.stream, { headers: sseResponseHeaders() });
}

async function runSSEAction(
  ctx: AppContext,
  action: string,
  target: SSEStreamTarget,
  handler: () => unknown | Promise<unknown>,
): Promise<void> {
  try {
    await handler();
  } catch (error: unknown) {
    ctx.logger?.error?.({ action, error }, 'AI SSE action failed');
    const message = error instanceof Error ? error.message : String(error);
    target.write(
      `data: ${JSON.stringify({ type: 'error', body: message })}\n\n`,
    );
  } finally {
    target.end();
  }
}

export function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  const status =
    Number((error as { status?: unknown })?.status) || statusForError(message);
  return Response.json(
    { errors: [{ message }], error: message },
    { status, headers: { 'x-local-ai': '1' } },
  );
}

export function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value)
    throw new Error(`${name} is required`);
  return value;
}

function actionFromPath(pathname: string): string {
  const prefix = `${AI_API_BASE_PATH}/`;
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname;
}

async function resolveAuthenticatedUser(
  auth: Auth,
  request: Request,
): Promise<CurrentUser> {
  const session = await auth.getSession(request.headers);
  const user = session?.user;
  if (!user?.id) return { id: 'anonymous', roles: ['member'], isRoot: false };
  const profile = user as typeof user & Record<string, unknown>;
  const roles = Array.isArray(profile.roles)
    ? profile.roles.filter((role): role is string => typeof role === 'string')
    : [];
  return {
    id: user.id,
    roles: roles.length ? roles : ['member'],
    isRoot:
      typeof profile.isRoot === 'boolean'
        ? profile.isRoot
        : roles.includes('root'),
    locale: typeof profile.locale === 'string' ? profile.locale : undefined,
  };
}

function statusForError(message: string): number {
  if (/not found/.test(message)) return 404;
  if (/invalid|is required|must be|Expected/.test(message)) return 400;
  return 500;
}
export function sendSSEError(
  target: StreamTarget,
  error: Error | string,
  errorName?: string,
): void {
  const body =
    typeof error === 'string' ? error : error.message || 'Unknown error';
  target.write(
    `data: ${JSON.stringify({ type: 'error', body, errorName })}\n\n`,
  );
  target.end();
}

export class ResourceActionError extends Error {
  constructor(
    readonly status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ResourceActionError';
  }
}
