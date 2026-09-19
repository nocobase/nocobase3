import type { Locale } from '@nocobase/i18n';

/** The server's language choice, which may differ from the browser's. */
export interface ServerLocaleResult {
  readonly locale: Locale;
  readonly requestedLocale: Locale;
  readonly fallback: boolean;
}
