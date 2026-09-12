import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Context, Env, MiddlewareHandler } from 'hono';
import type { CookieOptions } from 'hono/utils/cookie';

import type {
  NocoBaseSession,
  NocoBaseSessionManager,
  PersistSessionResult,
  SessionData,
} from './types.js';

export type SessionEnv<Data extends SessionData = SessionData> = Env & {
  Variables: {
    session: NocoBaseSession<Data>;
  };
};

export function createSessionMiddleware<Data extends SessionData = SessionData>(
  manager: NocoBaseSessionManager<Data>,
): MiddlewareHandler {
  return async (context: Context, next: () => Promise<void>): Promise<void> => {
    if (!manager.config.enabled) {
      await next();
      return;
    }

    const requestSession = manager.createRequestSession({
      cookieValue: getCookie(context, manager.config.cookie.name),
    });

    context.set('session', requestSession);

    try {
      await next();
    } finally {
      applyPersistResult(context, manager, await requestSession.persist());
      await maybeSweepExpiredSessions(manager);
    }
  };
}

function applyPersistResult<Data extends SessionData>(
  context: Context,
  manager: NocoBaseSessionManager<Data>,
  result: PersistSessionResult,
): void {
  if (result.action === 'none') {
    return;
  }

  const cookieOptions = createCookieOptions(manager, result.maxAge);
  if (result.action === 'delete-cookie') {
    deleteCookie(context, manager.config.cookie.name, cookieOptions);
    return;
  }

  if (result.cookieValue) {
    setCookie(
      context,
      manager.config.cookie.name,
      result.cookieValue,
      cookieOptions,
    );
  }
}

function createCookieOptions<Data extends SessionData>(
  manager: NocoBaseSessionManager<Data>,
  maxAge: number | undefined,
): CookieOptions {
  const cookie = manager.config.cookie;
  return {
    path: cookie.path,
    domain: cookie.domain,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    partitioned: cookie.partitioned,
    maxAge,
  };
}

async function maybeSweepExpiredSessions<Data extends SessionData>(
  manager: NocoBaseSessionManager<Data>,
): Promise<void> {
  const [hits, total] = manager.config.gcLottery;
  if (total <= 0 || hits <= 0) {
    return;
  }

  if (Math.floor(Math.random() * total) < hits) {
    await manager.sweepExpiredSessions();
  }
}
