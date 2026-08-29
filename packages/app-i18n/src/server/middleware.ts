import type { Context, MiddlewareHandler, Next } from 'hono';

import {
  APP_NS,
  parseAcceptLanguage,
  type I18nRuntime,
  type Locale,
  type Namespace,
  type Translator,
} from '../core/index.js';

/** Context keys the middleware sets, so a handler can read them off `c.get()`. */
export const LOCALE_CONTEXT_KEY = 'locale';
export const TRANSLATOR_CONTEXT_KEY = 't';

/** The session shape the middleware reads, kept structural so this package does not depend on the session package. */
interface SessionLike {
  readonly get?: (key: string) => unknown;
  readonly data?: Record<string, unknown>;
}

export interface I18nMiddlewareOptions {
  /** Namespace the request translator binds to. Defaults to the application's. */
  readonly namespace?: Namespace;
  /** Session key holding the chosen locale. */
  readonly sessionKey?: string;
}

function readSessionLocale(
  context: Context,
  sessionKey: string,
): Locale | undefined {
  let session: SessionLike | undefined;
  try {
    session = context.get(SESSION_CONTEXT_KEY) as SessionLike | undefined;
  } catch {
    // No session middleware is mounted, which is a valid configuration.
    return undefined;
  }
  if (!session) return undefined;

  const value =
    typeof session.get === 'function'
      ? session.get(sessionKey)
      : session.data?.[sessionKey];
  return typeof value === 'string' ? value : undefined;
}

const SESSION_CONTEXT_KEY = 'session';

/**
 * Resolves the locale for a request: the session's stored choice, then `Accept-Language`, then the default.
 */
export function resolveRequestLocale(
  runtime: I18nRuntime,
  context: Context,
  options: I18nMiddlewareOptions = {},
): Locale {
  const stored = readSessionLocale(context, options.sessionKey ?? 'locale');
  if (stored) return runtime.resolveLocale(stored);

  const accepted = parseAcceptLanguage(
    context.req.header('accept-language') ?? undefined,
  );
  return runtime.resolvePreferredLocale(accepted);
}

/**
 * Puts the request's locale and a translator bound to it on the context.
 *
 * Mount it after the session middleware, which it reads the stored locale from. It awaits the locale's resources, so a
 * handler can translate synchronously without risking a silent fallback to the key.
 */
export function createI18nMiddleware(
  runtime: I18nRuntime,
  options: I18nMiddlewareOptions = {},
): MiddlewareHandler {
  return async (context: Context, next: Next): Promise<void> => {
    const locale = resolveRequestLocale(runtime, context, options);
    await runtime.ensureLocaleLoaded(locale);

    context.set(LOCALE_CONTEXT_KEY, locale);
    context.set(
      TRANSLATOR_CONTEXT_KEY,
      runtime.getFixedT(options.namespace ?? APP_NS, locale),
    );

    await next();
  };
}

export function getRequestLocale(context: Context): Locale | undefined {
  return context.get(LOCALE_CONTEXT_KEY) as Locale | undefined;
}

export function getRequestTranslator(context: Context): Translator | undefined {
  return context.get(TRANSLATOR_CONTEXT_KEY) as Translator | undefined;
}
