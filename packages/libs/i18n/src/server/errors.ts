import type { I18nRuntime, Locale, Namespace } from '../core/index.js';

export interface AppI18nErrorOptions {
  readonly ns: Namespace;
  readonly key: string;
  readonly params?: Record<string, unknown>;
  readonly status?: number;
  readonly cause?: unknown;
}

export interface SerializedI18nError {
  readonly code: string;
  readonly message: string;
  readonly ns: Namespace;
  readonly key: string;
  readonly params?: Record<string, unknown>;
}

/**
 * An error that carries what it needs to be translated, rather than a message translated when it was thrown.
 *
 * Translation happens at serialization, where the request's locale is known. The same error therefore renders in
 * whatever language the caller asked for, and constructing one never requires knowing the locale.
 */
export class AppI18nError extends Error {
  public readonly code: string;
  public readonly ns: Namespace;
  public readonly key: string;
  public readonly params: Record<string, unknown> | undefined;
  public readonly status: number;

  public constructor(code: string, options: AppI18nErrorOptions) {
    // The untranslated message is what logs and stack traces show; the translated one is produced on serialization.
    super(`${code}: ${options.ns}:${options.key}`, { cause: options.cause });
    this.name = 'AppI18nError';
    this.code = code;
    this.ns = options.ns;
    this.key = options.key;
    this.params = options.params;
    this.status = options.status ?? 400;
  }
}

export function isAppI18nError(error: unknown): error is AppI18nError {
  return error instanceof AppI18nError;
}

/**
 * Renders an error for a response body.
 *
 * `message` is translated into the request's locale so an API-only application needs nothing else, while `ns`, `key`,
 * and `params` let a frontend re-render it in whatever language its interface is currently showing.
 */
export function serializeI18nError(
  runtime: I18nRuntime,
  error: AppI18nError,
  locale?: Locale,
): SerializedI18nError {
  const translate = runtime.getFixedT(error.ns, locale);
  return {
    code: error.code,
    message: translate(error.key, error.params),
    ns: error.ns,
    key: error.key,
    ...(error.params ? { params: error.params } : {}),
  };
}
