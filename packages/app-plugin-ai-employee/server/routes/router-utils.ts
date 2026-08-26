import type { Context as HonoContext } from 'hono';
import type { RuntimeActor } from '@nocobase/ai-employee';
import { sendSSEError } from '@nocobase/ai-employee';
import type { Context as AppContext, CurrentUser } from '@nocobase/ai-employee';
import { SSEStreamTarget, sseResponseHeaders } from './sse.js';

export type AIActionRequest = {
  context: HonoContext;
  request: Request;
  url: URL;
  body: unknown;
  actor: RuntimeActor;
  ctx: AppContext;
};

export type AIActionHandler = (
  request: AIActionRequest,
) => unknown | Promise<unknown>;
export type AIHonoHandler = (context: HonoContext) => Promise<Response>;
export type AISSEActionHandler = (
  request: AIActionRequest,
  target: SSEStreamTarget,
) => unknown | Promise<unknown>;

export function aiActionPath(apiBasePath: string, action: string): string {
  const basePath = apiBasePath.replace(/\/$/, '');
  return `${basePath}/${action}`;
}

export function createAIActionHandler(
  action: string,
  handler: AIActionHandler,
): AIHonoHandler {
  return async (context) => {
    try {
      const request = context.req.raw;
      const body = await readBody(request);
      const ctx = context.var.ctx;
      await ctx.ready;
      configureActionContext(ctx, action, body, request);
      const actor = actorFromCurrentUser(ctx.currentUser);
      ctx.logger?.info?.({ action, actorId: actor.id }, 'AI local action');
      const result = await handler({
        context,
        request,
        url: new URL(request.url),
        body,
        actor,
        ctx,
      });
      if (result instanceof Response) return withLocalHeader(result);
      return withLocalHeader(Response.json({ data: result }));
    } catch (error: any) {
      const ctx = context.var.ctx;
      ctx.logger?.error?.({ action, error }, 'AI local action failed');
      return errorResponse(error);
    }
  };
}

export function createAISSEActionHandler(
  action: string,
  handler: AISSEActionHandler,
): AIHonoHandler {
  return async (context) => {
    try {
      const request = context.req.raw;
      const body = await readBody(request);
      const ctx = context.var.ctx;
      await ctx.ready;
      const target = new SSEStreamTarget();
      configureActionContext(ctx, action, body, request, target);
      const actor = actorFromCurrentUser(ctx.currentUser);
      ctx.logger?.info?.({ action, actorId: actor.id }, 'AI local SSE action');
      void runSSEAction(ctx, action, target, () =>
        handler(
          { context, request, url: new URL(request.url), body, actor, ctx },
          target,
        ),
      );
      const response = new Response(target.stream, {
        headers: sseResponseHeaders(),
      });
      request.signal.addEventListener('abort', () => target.end());
      return withLocalHeader(response);
    } catch (error: any) {
      const ctx = context.var.ctx;
      ctx.logger?.error?.(
        { action, error },
        'AI local SSE action failed before stream',
      );
      return errorResponse(error);
    }
  };
}

function configureActionContext(
  ctx: AppContext,
  action: string,
  body: unknown,
  request: Request,
  res = ctx.res,
): void {
  const [resourceName, actionName] = action.split(':');
  ctx.body = body;
  ctx.res = res;
  ctx.action = {
    params: {
      ...Object.fromEntries(new URL(request.url).searchParams),
      values: body ?? {},
    },
    resourceName,
    actionName,
  };
}

async function runSSEAction(
  ctx: AppContext,
  action: string,
  target: SSEStreamTarget,
  handler: () => unknown | Promise<unknown>,
): Promise<void> {
  try {
    await handler();
  } catch (error: any) {
    ctx.logger?.error?.({ action, error }, 'AI SSE action failed');
    try {
      const message =
        error instanceof Error
          ? error.message
          : String(error ?? 'Unexpected error');
      await sendSSEError(ctx as never, message);
    } catch {
      // Ignore failures while reporting an SSE error.
    }
  } finally {
    target.end();
  }
}

export function withLocalHeader(response: Response): Response {
  response.headers.set('x-local-ai', '1');
  return response;
}

export function errorResponse(error: any): Response {
  const message = error instanceof Error ? error.message : String(error);
  const status = Number(error?.status) || statusForError(message);
  return withLocalHeader(
    Response.json({ errors: [{ message }], error: message }, { status }),
  );
}

export function objectBody(body: unknown): Record<string, any> {
  if (
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    !(body instanceof FormData)
  ) {
    return body as Record<string, any>;
  }
  return {};
}

export async function readBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) return request.formData();
  if (
    contentType.includes('application/json') ||
    contentType.includes('text/plain')
  ) {
    try {
      return await request.json();
    } catch {
      return {};
    }
  }
  return {};
}

export function sessionIdFromFilter(filter: string | null): string | undefined {
  if (!filter) return undefined;
  try {
    const parsed = JSON.parse(filter);
    if (parsed?.sessionId != null)
      return typeof parsed.sessionId === 'object'
        ? undefined
        : String(parsed.sessionId);
    return undefined;
  } catch {
    return undefined;
  }
}

export function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value)
    throw new Error(`${name} is required`);
  return value;
}

function actorFromCurrentUser(currentUser: CurrentUser): RuntimeActor {
  return {
    id: String(currentUser.id),
    roles: currentUser.roles,
    ...(currentUser.locale ? { locale: currentUser.locale } : {}),
    ...(currentUser.scope ? { scope: currentUser.scope } : {}),
  };
}

function statusForError(message: string): number {
  if (/not found|invalid|is required/.test(message)) return 400;
  return 500;
}
