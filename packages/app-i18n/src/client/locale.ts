import { useCallback, useEffect, useState } from 'react';

import type { I18nRuntime, Locale, LocaleDefinition } from '../core/index.js';
import { useI18nRuntime } from './context.js';

export interface UseLocaleResult {
  readonly locale: Locale;
  readonly locales: readonly LocaleDefinition[];
  readonly setLocale: (locale: Locale) => Promise<void>;
  /** True while resources for the requested locale are still loading. */
  readonly switching: boolean;
  readonly error: Error | undefined;
}

/**
 * The current locale, the ones available, and a way to change it.
 *
 * The switch is atomic: every namespace's resources for the new locale load before i18next changes language, so no
 * frame is ever rendered half-translated.
 */
export function useLocale(): UseLocaleResult {
  const runtime = useI18nRuntime();
  const [locale, setCurrentLocale] = useState<Locale>(() =>
    runtime.getLocale(),
  );
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    const handleChange = (next: string): void => setCurrentLocale(next);
    runtime.i18n.on('languageChanged', handleChange);
    // A language may have changed between the initial render and this subscription.
    setCurrentLocale(runtime.getLocale());
    return () => {
      runtime.i18n.off('languageChanged', handleChange);
    };
  }, [runtime]);

  const setLocale = useCallback(
    async (next: Locale): Promise<void> => {
      if (next === runtime.getLocale()) return;
      setSwitching(true);
      setError(undefined);
      try {
        await runtime.changeLanguage(next);
      } catch (cause) {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        throw cause;
      } finally {
        setSwitching(false);
      }
    },
    [runtime],
  );

  return {
    locale,
    locales: runtime.getLocaleDefinitions(),
    setLocale,
    switching,
    error,
  };
}

/**
 * Applies the locale to the document element, so the page reports its language and lays out in the right direction.
 */
export function applyDocumentLocale(runtime: I18nRuntime): void {
  if (typeof document === 'undefined') return;
  const locale = runtime.getLocale();
  const definition = runtime
    .getLocaleDefinitions()
    .find((candidate) => candidate.locale === locale);
  document.documentElement.lang = locale;
  document.documentElement.dir = definition?.direction ?? 'ltr';
}
