import type { Locale, LocaleDefinition, LocaleDirection } from './types.js';

const RTL_LANGUAGE_PATTERN = /^(ar|fa|he|ku|ur|yi)(-|$)/i;

export function getLocaleDirection(locale: Locale): LocaleDirection {
  return RTL_LANGUAGE_PATTERN.test(locale) ? 'rtl' : 'ltr';
}

/**
 * The locale's name in its own language, so a switcher reads "简体中文" rather than "Chinese" to someone looking for it.
 */
export function getLocaleLabel(locale: Locale): string {
  try {
    return (
      new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale
    );
  } catch {
    return locale;
  }
}

export function describeLocale(
  locale: Locale,
  label?: string,
): LocaleDefinition {
  return Object.freeze({
    locale,
    label: label ?? getLocaleLabel(locale),
    direction: getLocaleDirection(locale),
  });
}

/**
 * Resolves a requested locale against the ones an application enables.
 *
 * An exact match wins, then a match on the language subtag alone, so a browser asking for `zh` or `zh-Hans-CN` still
 * lands on a configured `zh-CN` instead of falling back to English. Returns `undefined` when nothing matches, leaving
 * the decision of what to do about it to the caller.
 */
export function resolveSupportedLocale(
  requested: Locale | undefined,
  supported: readonly Locale[],
): Locale | undefined {
  if (!requested) return undefined;

  const normalized = requested.toLowerCase();
  const exact = supported.find(
    (candidate) => candidate.toLowerCase() === normalized,
  );
  if (exact) return exact;

  const language = normalized.split('-')[0];
  return supported.find(
    (candidate) => candidate.toLowerCase().split('-')[0] === language,
  );
}

/**
 * Parses an `Accept-Language` header into the locales it lists, most preferred first.
 *
 * Entries with `q=0` are explicitly refused by the client and are dropped rather than ranked last.
 */
export function parseAcceptLanguage(header: string | undefined): Locale[] {
  if (!header) return [];

  return header
    .split(',')
    .map((part) => {
      const [tag, ...parameters] = part.trim().split(';');
      const quality = parameters
        .map((parameter) => /^\s*q=([\d.]+)\s*$/.exec(parameter))
        .find((match) => match !== null);
      return {
        tag: tag.trim(),
        quality: quality ? Number(quality[1]) : 1,
      };
    })
    .filter((entry) => entry.tag && entry.tag !== '*' && entry.quality > 0)
    .sort((left, right) => right.quality - left.quality)
    .map((entry) => entry.tag);
}
