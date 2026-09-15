import {
  useOptionalI18nRuntime,
  useLocale as useRuntimeLocale,
  type Locale,
  type LocaleDefinition,
} from '@nocobase/i18n/client';
import {
  createApiClient,
  resolveAppUrl,
  writeStoredLocale,
  type ApiClient,
} from '@nocobase/app-client';
import { useCallback, useEffect, useState } from 'react';

import type { ServerLocaleResult } from '../locale-result.js';

/** Path under the application's API root, which is where the server is told which language to answer in. */
const LOCALE_PATH = 'i18n/locale';

let client: ApiClient | undefined;

/**
 * Hands the plugin the Application's own API client. The client ServiceProvider calls this during boot, which is what
 * makes a configured `api.baseURL` apply here too instead of being silently ignored.
 */
export function configureLocaleClient(api: ApiClient): ApiClient {
  client = api;
  return api;
}

/**
 * The API client. The Application's own once it has booted, and otherwise one created here.
 *
 * The fallback covers a component rendered outside an Application, which is what a focused test does. It resolves
 * paths against the application's own base — an app served from `/main/` answers at `/main/api`, so a hard-coded
 * `/api/...` would miss it entirely.
 */
function getClient(): ApiClient {
  client ??= createApiClient({ baseURL: resolveAppUrl('/api') });
  return client;
}

export interface UseAppLocaleResult {
  readonly locale: Locale;
  readonly locales: readonly LocaleDefinition[];
  readonly setLocale: (locale: Locale) => Promise<ServerLocaleResult>;
  readonly switching: boolean;
  readonly error: Error | undefined;
}

/**
 * Tells the server which language to answer in.
 *
 * Exported so the path resolution can be tested: it has to land under the application's base, not the origin root.
 */
export async function notifyServerLocale(
  locale: Locale,
): Promise<ServerLocaleResult> {
  return getClient().request<ServerLocaleResult>({
    path: LOCALE_PATH,
    method: 'POST',
    json: { locale },
  });
}

/**
 * The current language and a way to change it.
 *
 * Loads and switches the interface before persisting the choice and notifying the server. A server fallback is a
 * successful result the control can explain; transport failures reject without undoing the browser's language.
 */
export function useAppLocale(): UseAppLocaleResult {
  const runtime = useOptionalI18nRuntime();
  const { locale, locales, setLocale, switching, error } = useRuntimeLocale();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<Error>();

  const changeLocale = useCallback(
    async (next: Locale): Promise<ServerLocaleResult> => {
      setSyncing(true);
      setSyncError(undefined);
      try {
        await setLocale(next);
        const selected = runtime?.getLocale() ?? next;
        writeStoredLocale(selected);
        return await notifyServerLocale(selected);
      } catch (cause) {
        setSyncError(cause instanceof Error ? cause : new Error(String(cause)));
        throw cause;
      } finally {
        setSyncing(false);
      }
    },
    [runtime, setLocale],
  );

  return {
    locale,
    locales,
    setLocale: changeLocale,
    switching: switching || syncing,
    error: syncError ?? error,
  };
}

/**
 * Tells the server which language this browser is using, once, at startup.
 *
 * Storage and the server's session drift apart routinely — a different browser, an expired session, a switch made in
 * another tab — and this is what brings them back together.
 */
export function useSyncServerLocale(): void {
  // Optional, so the shell can call this unconditionally: an application composed without i18n, which is what a
  // focused test renders, has no language to report and simply does nothing.
  const runtime = useOptionalI18nRuntime();

  useEffect(() => {
    if (!runtime) return;
    const synchronization = notifyServerLocale(runtime.getLocale());
    synchronization.catch(() => {
      // Nothing to do: the interface is already correct, and the next startup tries again.
    });
  }, [runtime]);
}
