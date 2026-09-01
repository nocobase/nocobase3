import { I18nRuntime, type Locale, type LocalesModule } from '@nocobase/i18n';

import type { AppClientContributionSource } from './plugins.js';

const LOCALE_STORAGE_KEY = 'nocobase.locale';

export interface AppClientLocaleContribution {
  readonly packageName: string;
  readonly source: AppClientContributionSource;
  readonly locales: LocalesModule;
}

export interface CreateAppI18nRuntimeOptions {
  readonly defaultLocale?: Locale;
  readonly locales?: readonly Locale[];
  readonly contributions: readonly AppClientLocaleContribution[];
  /** The locale to start in. Resolved from storage and the browser when omitted. */
  readonly initialLocale?: Locale;
}

/**
 * Reads the visitor's stored language preference.
 *
 * Storage is the source of truth on the client, so the first frame renders in the right language without waiting for
 * the server. Access is guarded because a browser can refuse it outright in private modes.
 */
export function readStoredLocale(): Locale | undefined {
  try {
    return globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // A visitor who blocks storage still gets a working switch for this session.
  }
}

function detectBrowserLocale(): Locale | undefined {
  return globalThis.navigator?.language ?? undefined;
}

/**
 * Builds the i18n runtime for an application and loads the starting locale.
 *
 * Every contribution's resources for that one locale are fetched in parallel before this resolves, so the application
 * renders already translated instead of flashing keys behind a loading state. Other locales stay unfetched until the
 * visitor switches to one.
 */
export async function createAppI18nRuntime(
  options: CreateAppI18nRuntimeOptions,
): Promise<I18nRuntime> {
  const applicationContribution = options.contributions.find(
    (contribution) => contribution.source === 'application',
  );
  const defaultLocale = options.defaultLocale ?? 'en-US';
  const declaredLocales = new Set<Locale>([defaultLocale]);
  for (const contribution of options.contributions) {
    for (const locale of Object.keys(
      'default' in contribution.locales
        ? contribution.locales.default
        : contribution.locales,
    )) {
      declaredLocales.add(locale);
    }
  }

  const runtime = new I18nRuntime({
    defaultLocale,
    locales: options.locales ?? [...declaredLocales],
    applicationNamespace: applicationContribution?.packageName,
  });

  for (const contribution of options.contributions) {
    if (contribution.source === 'application') {
      runtime.registerApplicationNamespace(
        contribution.packageName,
        contribution.locales,
      );
    } else {
      runtime.registerNamespace(contribution.packageName, contribution.locales);
    }
  }

  await runtime.init(
    options.initialLocale ?? readStoredLocale() ?? detectBrowserLocale(),
  );
  return runtime;
}
