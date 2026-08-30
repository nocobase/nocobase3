import {
  useI18nRuntime,
  useLocale as useRuntimeLocale,
  applyDocumentLocale,
  type Locale,
  type LocaleDefinition,
} from '@nocobase/app-i18n/client';
import { writeStoredLocale } from '@nocobase/app-client';
import { createAppClient, type AppClient } from '@nocobase/app-sdk';
import { useCallback, useEffect } from 'react';

/** Path under the application's API root, which is where the server is told which language to answer in. */
const LOCALE_PATH = 'i18n/locale';

let client: AppClient | undefined;

/**
 * The API client, created on first use.
 *
 * It resolves paths against the application's own base — an app served from `/main/` answers at `/main/api`, so a
 * hard-coded `/api/...` would miss it entirely.
 */
function getClient(): AppClient {
  client ??= createAppClient();
  return client;
}

export interface UseAppLocaleResult {
  readonly locale: Locale;
  readonly locales: readonly LocaleDefinition[];
  readonly setLocale: (locale: Locale) => Promise<void>;
  readonly switching: boolean;
  readonly error: Error | undefined;
}

/**
 * Tells the server which language to answer in.
 *
 * Exported so the path resolution can be tested: it has to land under the application's base, not the origin root.
 */
export async function notifyServerLocale(locale: Locale): Promise<void> {
  await getClient().request(LOCALE_PATH, {
    method: 'POST',
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
        await notifyServerLocale(next);
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
    void notifyServerLocale(runtime.getLocale()).catch(() => {
      // Nothing to do: the interface is already correct, and the next startup tries again.
    });
  }, [runtime]);
}
