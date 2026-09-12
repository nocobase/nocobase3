import { APP_NS, type I18nRuntime, type Namespace } from '../core/index.js';

/**
 * Refine's translation contract, declared structurally so this package does not depend on `@refinedev/core`.
 */
export interface RefineI18nProvider {
  translate: (
    key: string,
    options?: unknown,
    defaultMessage?: string,
  ) => string;
  // Refine accepts a promise or a plain value here; both collapse to `unknown`.
  changeLocale: (locale: string, options?: unknown) => unknown;
  getLocale: () => string;
}

export interface CreateRefineI18nProviderOptions {
  /** Namespace for keys Refine itself translates. Defaults to the application's. */
  readonly namespace?: Namespace;
}

/**
 * Adapts the runtime to Refine's `i18nProvider`.
 */
export function createRefineI18nProvider(
  runtime: I18nRuntime,
  options: CreateRefineI18nProviderOptions = {},
): RefineI18nProvider {
  // APP_NS resolves at translation time, so the provider works whether or not an application namespace is registered.
  const namespace = options.namespace ?? APP_NS;

  return {
    translate(key, translateOptions, defaultMessage) {
      // Refine calls this either as `(key, options, defaultMessage)` or as `(key, defaultMessage)`, so a string in the
      // second position is the default message rather than options.
      const resolvedDefault =
        typeof translateOptions === 'string'
          ? translateOptions
          : defaultMessage;
      const resolvedOptions =
        typeof translateOptions === 'object' && translateOptions !== null
          ? (translateOptions as Record<string, unknown>)
          : undefined;

      return runtime.getFixedT(namespace)(key, {
        ...resolvedOptions,
        ...(resolvedDefault === undefined
          ? {}
          : { defaultValue: resolvedDefault }),
      });
    },
    changeLocale: (locale) => runtime.changeLanguage(locale),
    getLocale: () => runtime.getLocale(),
  };
}
