import type { I18nProvider } from "@refinedev/core";
import { createInstance, type InitOptions, type TOptions } from "i18next";

import { nocobaseClient } from "../client/index.ts";
import {
  configurePortalLocales,
  getDefaultLocale,
  getLocaleDefinition,
  getLocaleDirection,
  getLocaleLabel,
  registerLocale,
  resolveSupportedLocale,
  setEnabledLocales,
  type LocaleDefinition,
} from "./locales.ts";
import {
  getTranslationResources,
  setTranslationResolver,
  subscribeTranslationResources,
  type TranslationOptions,
} from "./translation.ts";

export type LocaleResources = Record<
  string,
  Record<string, string | number | boolean>
>;

export type LocaleSystemSettings = {
  appLang?: string | null;
  enabledLanguages?: string[] | null;
};

export type PortalI18nConfiguration = {
  defaultLocale: string;
  locales: LocaleDefinition[];
  initOptions?: InitOptions;
  onLocaleChanged?: (locale: string) => void | Promise<void>;
};

type LocalePersistence = (locale: string) => void | Promise<void>;

let localePersistence: LocalePersistence | undefined;
let onLocaleChanged: PortalI18nConfiguration["onLocaleChanged"];
let i18nBindingsConfigured = false;

export const i18n = createInstance();

function addLocaleResources(namespace: string, resources: LocaleResources) {
  if (!i18n.isInitialized) return;

  for (const [locale, resource] of Object.entries(resources)) {
    i18n.addResourceBundle(locale, namespace, resource, true, true);
    registerLocale({
      locale,
      label: getLocaleLabel(locale),
      direction: getLocaleDirection(locale),
    });
  }
}

function configureI18nBindings() {
  if (i18nBindingsConfigured) return;
  i18nBindingsConfigured = true;
  subscribeTranslationResources(addLocaleResources);
  setTranslationResolver(translate);
}

export async function configurePortalI18n({
  defaultLocale,
  locales,
  initOptions,
  onLocaleChanged: nextOnLocaleChanged,
}: PortalI18nConfiguration) {
  configurePortalLocales({ defaultLocale, locales });
  onLocaleChanged = nextOnLocaleChanged;
  configureI18nBindings();

  await i18n.init({
    lng: resolveSupportedLocale(nocobaseClient.getLocale()),
    fallbackLng: defaultLocale,
    defaultNS: "translation",
    keySeparator: false,
    nsSeparator: false,
    initImmediate: false,
    interpolation: {
      escapeValue: false,
    },
    ...initOptions,
  });

  getTranslationResources().forEach(([namespace, resources]) =>
    addLocaleResources(namespace, resources)
  );
  applyDocumentLocale();
}

export function getCurrentLocale() {
  return resolveSupportedLocale(
    i18n.resolvedLanguage ?? i18n.language ?? nocobaseClient.getLocale()
  );
}

export function translate(
  key: string,
  options?: TranslationOptions | string,
  defaultMessage?: string
) {
  const normalizedOptions = typeof options === "string" ? undefined : options;
  const normalizedDefault =
    typeof options === "string" ? options : defaultMessage;
  if (!i18n.isInitialized) {
    return normalizedDefault ?? normalizedOptions?.defaultValue ?? key;
  }

  const value = i18n.t(key, {
    ...(normalizedOptions as TOptions),
    defaultValue: normalizedDefault ?? normalizedOptions?.defaultValue ?? key,
  });

  return typeof value === "string" ? value : String(value);
}

export function applyDocumentLocale(locale = getCurrentLocale()) {
  if (typeof document === "undefined") return;
  const direction =
    getLocaleDefinition(locale)?.direction ?? getLocaleDirection(locale);
  document.documentElement.lang = locale;
  document.documentElement.dir = direction;
}

function resolveSystemLocale(settings?: LocaleSystemSettings) {
  const enabledLanguages = Array.isArray(settings?.enabledLanguages)
    ? settings.enabledLanguages.filter(Boolean)
    : [];
  const storedLocale = nocobaseClient.getStoredLocale();

  if (
    storedLocale &&
    (!enabledLanguages.length || enabledLanguages.includes(storedLocale))
  ) {
    return resolveSupportedLocale(storedLocale);
  }

  const defaultLocale =
    settings?.appLang || enabledLanguages[0] || getDefaultLocale();
  return resolveSupportedLocale(defaultLocale);
}

export async function applySystemLocale(settings?: LocaleSystemSettings) {
  const enabledLanguages = Array.isArray(settings?.enabledLanguages)
    ? settings.enabledLanguages.filter(Boolean)
    : [];
  if (enabledLanguages.length) setEnabledLocales(enabledLanguages);

  const storedLocale = nocobaseClient.getStoredLocale();
  if (
    storedLocale &&
    enabledLanguages.length &&
    !enabledLanguages.includes(storedLocale)
  ) {
    nocobaseClient.setLocale(null);
  }

  const locale = resolveSystemLocale(settings);
  nocobaseClient.setRuntimeLocale(locale);
  await i18n.changeLanguage(locale);
  applyDocumentLocale(locale);
  return locale;
}

export function setLocalePersistence(persistence?: LocalePersistence) {
  localePersistence = persistence;
  return () => {
    if (localePersistence === persistence) localePersistence = undefined;
  };
}

export async function changeLocale(locale: string) {
  const nextLocale = resolveSupportedLocale(locale);

  try {
    await localePersistence?.(nextLocale);
  } catch (error) {
    console.warn("Unable to persist the language preference", error);
  }

  nocobaseClient.setLocale(nextLocale);
  await i18n.changeLanguage(nextLocale);
  applyDocumentLocale(nextLocale);
  await onLocaleChanged?.(nextLocale);
}

export const i18nProvider: I18nProvider = {
  translate,
  changeLocale,
  getLocale: getCurrentLocale,
};
