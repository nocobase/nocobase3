import type { Context, MiddlewareHandler, Next } from 'hono';

import {
  APP_NS,
  parseAcceptLanguage,
  type I18nRuntime,
  type Locale,
  type Namespace,
  type Translator,
} from '../core/index.js';
import { getContextSession } from './session.js';

/** Context keys the middleware sets, so a handler can read them off `c.get()`. */
export const LOCALE_CONTEXT_KEY = 'locale';
export const TRANSLATOR_CONTEXT_KEY = 't';

/** Session key the chosen locale is stored under. */
export const LOCALE_SESSION_KEY = 'locale';

export interface I18nMiddlewareOptions {
  /** Namespace the request translator binds to. Defaults to the application's. */
  readonly namespace?: Namespace;
  /** Session key holding the chosen locale. */
  readonly sessionKey?: string;
}

async function readSessionLocale(
  context: Context,
  sessionKey: string,
): Promise<Locale | undefined> {
  // An application may mount no session middleware at all, which is a valid configuration rather than an error.
  const session = getContextSession(context);
  if (!session) return undefined;

  try {
    const data = await session.get();
    const value = data?.[sessionKey];
    return typeof value === 'string' ? value : undefined;
  } catch {
    // An unreadable session should degrade to header negotiation, not fail the request.
    return undefined;
  }
}

/**
 * Resolves the locale for a request: the session's stored choice, then `Accept-Language`, then the default.
 */
export async function resolveRequestLocale(
  runtime: I18nRuntime,
  context: Context,
  options: I18nMiddlewareOptions = {},
): Promise<Locale> {
  const stored = await readSessionLocale(
    context,
    options.sessionKey ?? LOCALE_SESSION_KEY,
  );
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
    const locale = await resolveRequestLocale(runtime, context, options);
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

/**
 * Returns the translator installed for the current request, optionally bound to a namespace.
 *
 * The i18n middleware loads the request locale before installing this translator. A missing translator therefore
 * means the middleware did not run before the route, which is an application wiring error rather than an optional
 * request state.
 */
export function getRequestTranslator(
  context: Context,
  namespace?: Namespace,
): Translator {
  const translator = context.get(TRANSLATOR_CONTEXT_KEY) as
    Translator | undefined;
  if (!translator) {
    throw new Error(
      'Request translator is unavailable. Make sure the i18n HTTP middleware is mounted before the route.',
    );
  }

  if (!namespace) return translator;

  return (key, options) =>
    translator(key, {
      ...options,
      ns: options?.ns ?? namespace,
    });
}
