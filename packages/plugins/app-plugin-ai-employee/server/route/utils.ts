import { DomainError } from '../domain/errors.js';
import type { Auth } from '@nocobase/app-plugin-authentication';
import type { Logger } from '@nocobase/logging';
import type { CurrentUser } from '../internal/runtime-context.js';
import type { Context as HonoContext, MiddlewareHandler } from 'hono';
import { AI_API_BASE_PATH } from './contracts.js';
import { SSEStreamTarget, sseResponseHeaders } from './sse.js';

declare module 'hono' {
  interface ContextVariableMap {
    currentUser: CurrentUser;
  }
}

export interface AIRequestMiddlewareOptions {
  readonly ready: () => Promise<void>;
  readonly logger: Logger;
}

export function createAICurrentUserMiddleware(auth: Auth): MiddlewareHandler {
  return async (context, next) => {
    context.set(
      'currentUser',
      await resolveAuthenticatedUser(auth, context.req.raw),
    );
    await next();
  };
}

export function createAIRequestMiddleware(
  options: AIRequestMiddlewareOptions,
): MiddlewareHandler {
  return async (context, next) => {
    const action = actionFromPath(context.req.path);

    try {
      await options.ready();
      const currentUser = context.var.currentUser;
      options.logger.info?.(
        { action, userId: currentUser.id },
        'AI local action',
      );
      await next();
      context.header('x-local-ai', '1');
    } catch (error: unknown) {
      options.logger.error?.({ action, error }, 'AI local action failed');
      return errorResponse(error);
    }
  };
}

export function createAISSEStreamResponse(
  context: HonoContext,
  _action: string,
  handler: (target: SSEStreamTarget) => unknown | Promise<unknown>,
): Response {
  const target = new SSEStreamTarget();
  const request = context.req.raw;

  void runSSEAction(target, () => handler(target));
  request.signal.addEventListener('abort', () => target.end(), { once: true });

  return new Response(target.stream, { headers: sseResponseHeaders() });
}

async function runSSEAction(
  target: SSEStreamTarget,
  handler: () => unknown | Promise<unknown>,
): Promise<void> {
  try {
    await handler();
  } catch (error: unknown) {
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
  const explicitStatus = Number((error as { status?: unknown })?.status);
  const status =
    error instanceof DomainError
      ? error.status
      : explicitStatus || statusForError(message);
  return Response.json(
    { errors: [{ message }], error: message },
    { status, headers: { 'x-local-ai': '1' } },
  );
}

export function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) {
    throw new DomainError('VALIDATION_ERROR', `${name} is required`, 400);
  }
  return value;
}

function actionFromPath(pathname: string): string {
  const prefix = `${AI_API_BASE_PATH}/`;
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname;
}

function statusForError(message: string): number {
  if (/not found/.test(message)) return 404;
  if (/invalid|is required|must be|Expected/.test(message)) return 400;
  return 500;
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
