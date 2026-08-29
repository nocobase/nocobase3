import {
  useI18nRuntime,
  useLocale as useRuntimeLocale,
  applyDocumentLocale,
  type Locale,
  type LocaleDefinition,
} from '@nocobase/app-i18n/client';
import { writeStoredLocale } from '@nocobase/app-client';
import { useCallback, useEffect } from 'react';

/** Where the server is told which language to answer in. */
const LOCALE_ENDPOINT = '/api/i18n/locale';

export interface UseAppLocaleResult {
  readonly locale: Locale;
  readonly locales: readonly LocaleDefinition[];
  readonly setLocale: (locale: Locale) => Promise<void>;
  readonly switching: boolean;
  readonly error: Error | undefined;
}

async function notifyServer(locale: Locale): Promise<void> {
  await fetch(LOCALE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
  });
}

/**
 * The current language and a way to change it.
 *
 * Switching writes storage first so a refresh cannot lose the choice, loads every namespace's resources for the new
 * language, tells the server, then changes the language — all namespaces at once, so no frame renders half-translated.
 */
export function useAppLocale(): UseAppLocaleResult {
  const runtime = useI18nRuntime();
  const { locale, locales, setLocale, switching, error } = useRuntimeLocale();

  useEffect(() => {
    applyDocumentLocale(runtime);
  }, [runtime, locale]);

  const changeLocale = useCallback(
    async (next: Locale): Promise<void> => {
      writeStoredLocale(next);
      await setLocale(next);
      try {
        await notifyServer(next);
      } catch (cause) {
        // The interface has already switched; only server-rendered strings lag behind, and the next startup
        // reconciles them. Failing the switch over this would be worse than the inconsistency.
        console.warn(
          'Unable to tell the server about the language change',
          cause,
        );
      }
    },
    [setLocale],
  );

  return { locale, locales, setLocale: changeLocale, switching, error };
}

/**
 * Tells the server which language this browser is using, once, at startup.
 *
 * Storage and the server's session drift apart routinely — a different browser, an expired session, a switch made in
 * another tab — and this is what brings them back together.
 */
export function useSyncServerLocale(): void {
  const runtime = useI18nRuntime();

  useEffect(() => {
    void notifyServer(runtime.getLocale()).catch(() => {
      // Nothing to do: the interface is already correct, and the next startup tries again.
    });
  }, [runtime]);
}
