import {
  createInstance,
  type i18n as I18nInstance,
  type InitOptions,
} from 'i18next';

import { describeLocale, resolveSupportedLocale } from './locales.js';
import { BASE_LOCALE, BASE_NAMESPACE, I18nRegistry } from './registry.js';
import type {
  Locale,
  LocaleDefinition,
  LocalesModule,
  Namespace,
  TranslationResource,
} from './types.js';

/**
 * Three things decide what language something is rendered in, and they are easy to confuse:
 *
 * - **`defaultLocale`** is the application's — one value from `i18n.defaultLocale` in its configuration, the same for
 *   everyone. It decides what a visitor who has never chosen sees, and it is where a lookup falls back to when the
 *   language in use has no translation for a key.
 * - **The offered locales** are a list, and configuration does not state it: the application's own `locales/` files
 *   are the list. A plugin's locale files supply translations for languages already on it and never add one, so
 *   installing a plugin that ships Japanese does not put Japanese in the picker.
 * - **The locale in use** is per visitor and per request, computed rather than configured — a stored choice in the
 *   browser, or the session and `Accept-Language` on the server, each falling back to `defaultLocale`. A visitor
 *   switching to Chinese changes this alone; the application's default is untouched.
 *
 * So `defaultLocale` is an input to the last of the three, never its result.
 */
export interface I18nRuntimeOptions {
  /**
   * The language to use when nothing else decides, and the first fallback for a key the language in use lacks.
   *
   * This is the application's default, not a visitor's current language — pass the latter to `init()` instead.
   */
  readonly defaultLocale: Locale;
  /**
   * Locales the application offers, stated outright.
   *
   * Omit it and the list is derived from the application namespace's own locale files instead, which is what an
   * application does: the languages it ships translations for are the languages it offers. Pass it only where there is
   * no application namespace to derive from, such as a test exercising a plugin's namespace on its own.
   */
  readonly locales?: readonly Locale[];
  /** The application's own package name, which anchors the fallback chain. */
  readonly applicationNamespace?: Namespace;
  readonly initOptions?: InitOptions;
}

export interface I18nTranslateOptions {
  readonly ns?: Namespace;
  readonly locale?: Locale;
  readonly defaultValue?: string;
  readonly [key: string]: unknown;
}

export type Translator = (
  key: string,
  options?: I18nTranslateOptions,
) => string;

/**
 * The shared i18next instance plus the loading rules around it.
 *
 * There is one instance per process or per browser tab, with namespaces partitioning it. That is what makes a language
 * switch reach every plugin at once: they all subscribe to the same `languageChanged` event.
 */
export class I18nRuntime {
  public readonly registry: I18nRegistry = new I18nRegistry();
  public readonly i18n: I18nInstance = createInstance();

  private readonly declaredLocales: readonly Locale[] | undefined;
  private locales: Locale[];
  private readonly defaultLocale: Locale;
  private initialized = false;
  private readonly localeLoads = new Map<Locale, Promise<void>>();

  public constructor(private readonly options: I18nRuntimeOptions) {
    this.defaultLocale = options.defaultLocale;
    this.declaredLocales = options.locales;
    if (options.applicationNamespace) {
      this.registry.setApplicationNamespace(options.applicationNamespace);
    }
    this.locales = this.computeLocales();
  }

  /**
   * The languages on offer: whichever the application's own locale files declare, plus the default.
   *
   * A plugin's locale file supplies translations, not languages — an installed plugin that happens to ship `ja-JP`
   * must not put Japanese in the application's picker. The default is always present so a resolution has somewhere to
   * land even before any namespace has registered, and it is appended rather than prepended so changing it does not
   * reorder a language picker.
   */
  private computeLocales(): Locale[] {
    const applicationNamespace = this.registry.getApplicationNamespace();
    const declared =
      this.declaredLocales ??
      (applicationNamespace
        ? this.registry.getNamespaceLocales(applicationNamespace)
        : []);
    return [...new Set([...declared, this.defaultLocale])];
  }

  public getDefaultLocale(): Locale {
    return this.defaultLocale;
  }

  public getLocales(): readonly Locale[] {
    return this.locales;
  }

  public getLocaleDefinitions(): readonly LocaleDefinition[] {
    // The full set is passed so each label can be shortened only where it stays unambiguous.
    return this.locales.map((locale) =>
      describeLocale(locale, undefined, this.locales),
    );
  }

  /** Resolves a requested locale to a supported one, falling back to the default when nothing matches. */
  public resolveLocale(requested: Locale | undefined): Locale {
    return (
      resolveSupportedLocale(requested, this.locales) ?? this.defaultLocale
    );
  }

  /** Picks the first supported locale out of an ordered list of preferences, such as `Accept-Language`. */
  public resolvePreferredLocale(requested: readonly Locale[]): Locale {
    for (const candidate of requested) {
      const resolved = resolveSupportedLocale(candidate, this.locales);
      if (resolved) return resolved;
    }
    return this.defaultLocale;
  }

  public registerNamespace(namespace: Namespace, module: LocalesModule): void {
    this.registry.registerModule(namespace, module);
  }

  public registerApplicationNamespace(
    namespace: Namespace,
    module: LocalesModule,
  ): void {
    this.registry.setApplicationNamespace(namespace);
    this.registry.registerModule(namespace, module);
    // The application's locale files are what decides the offered languages, so the list is only correct once they are
    // registered — which on the server happens well after the runtime is constructed.
    this.locales = this.computeLocales();
  }

  /**
   * Loads a locale across every namespace and feeds it into the instance, at most once per locale.
   *
   * Call this before translating into a locale that has not been used yet. Skipping it does not throw — translations
   * silently fall back to the key or the default language, which is hard to notice, so request handling calls it
   * automatically and code running outside a request must call it itself.
   *
   * The fallback languages are loaded alongside it. A namespace that has not translated the language in use is the
   * ordinary case rather than an error, and the fallback only produces a translation if its resources are present to
   * be read.
   */
  public async ensureLocaleLoaded(locale: Locale): Promise<void> {
    const resolved = this.resolveLocale(locale);
    await Promise.all(
      [...new Set([resolved, this.defaultLocale, BASE_LOCALE])].map((entry) =>
        this.loadOneLocale(entry),
      ),
    );
  }

  private async loadOneLocale(locale: Locale): Promise<void> {
    const pending = this.localeLoads.get(locale);
    if (pending) return pending;

    const request = this.loadLocaleResources(locale);
    this.localeLoads.set(locale, request);

    try {
      await request;
    } catch (error) {
      // A failed load must not be cached, or the locale could never be retried.
      this.localeLoads.delete(locale);
      throw error;
    }
  }

  private async loadLocaleResources(locale: Locale): Promise<void> {
    const { resources, overrides } = await this.registry.loadLocale(locale);

    for (const entry of resources) {
      this.addResourceBundle(locale, entry.namespace, entry.resource);
    }

    // Overrides are applied last so an application always wins over the plugin it is rewording, whatever order the
    // namespaces happened to load in.
    for (const [namespace, resource] of Object.entries(overrides)) {
      if (resource) this.addResourceBundle(locale, namespace, resource);
    }
  }

  private addResourceBundle(
    locale: Locale,
    namespace: Namespace,
    resource: TranslationResource,
  ): void {
    this.i18n.addResourceBundle(locale, namespace, resource, true, true);
  }

  /**
   * Initializes the instance for a locale, loading that locale's resources first so the first render is already
   * translated and no loading state is needed.
   */
  public async init(
    locale: Locale = this.defaultLocale,
  ): Promise<I18nInstance> {
    if (this.initialized) {
      await this.changeLanguage(locale);
      return this.i18n;
    }

    const resolved = this.resolveLocale(locale);
    this.initialized = true;

    await this.i18n.init({
      lng: resolved,
      // A chain, not one language: the application's default first, then English. A plugin that has not translated
      // the language in use falls back to the application's default, and to English when it lacks that one too — which
      // is what an application defaulting to Chinese and adding Spanish leaves a plugin facing.
      fallbackLng: [...new Set([this.defaultLocale, BASE_LOCALE])],
      defaultNS: this.registry.getApplicationNamespace() ?? BASE_NAMESPACE,
      // Keys nest, so `trigger.types.schedule` addresses a tree. Namespaces never travel inside the key: they are
      // passed through options, which keeps a colon in a key from being read as a namespace separator.
      keySeparator: '.',
      nsSeparator: false,
      // Resources are added by `ensureLocaleLoaded` rather than by a backend plugin, so there is nothing to defer and
      // `t()` is usable the moment `init` resolves.
      initAsync: false,
      interpolation: { escapeValue: false },
      react: {
        // Without this react-i18next keeps only the first namespace of the list it is given, which would drop the
        // fallback chain that `NamespaceScope` passes down and leave a plugin unable to reuse application wording.
        nsMode: 'fallback',
      },
      ...this.options.initOptions,
    });

    await this.ensureLocaleLoaded(resolved);
    return this.i18n;
  }

  public getLocale(): Locale {
    return this.resolveLocale(this.i18n.resolvedLanguage ?? this.i18n.language);
  }

  /** Loads the locale's resources across every namespace, then switches, so the change lands everywhere at once. */
  public async changeLanguage(locale: Locale): Promise<Locale> {
    const resolved = this.resolveLocale(locale);
    await this.ensureLocaleLoaded(resolved);
    await this.i18n.changeLanguage(resolved);
    return resolved;
  }

  /**
   * A translator bound to a namespace, and optionally to a locale.
   *
   * Pass `locale` explicitly for anything leaving the process — mail, notifications, queue jobs — because the language
   * of outbound content follows its recipient, not whoever triggered the work.
   */
  public getFixedT(namespace: Namespace, locale?: Locale): Translator {
    // The chain is passed as an ordered namespace list rather than through `fallbackNS`, which i18next only reads from
    // instance options — a single instance serves every namespace here, and each one needs its own chain.
    const chain = this.namespaceChain(namespace);
    // i18next types `t` against namespaces known at compile time, while every namespace here is a package name
    // resolved at runtime. This is the one place that gap is bridged, and it is narrowed to the real contract —
    // a key plus options in, a string out — rather than widened away.
    const translate = this.i18n.getFixedT(locale ?? null, chain) as (
      key: string,
      options?: Record<string, unknown>,
    ) => string;

    return (key, options) => {
      // An explicit `ns` overrides the binding, and still falls back through the chain behind it.
      const namespaces = options?.ns
        ? this.namespaceChain(options.ns)
        : undefined;
      return translate(key, {
        ...options,
        ...(namespaces ? { ns: namespaces } : {}),
      });
    };
  }

  /** A namespace followed by its fallbacks, with `APP_NS` resolved to the application's package name. */
  private namespaceChain(namespace: Namespace): Namespace[] {
    return [
      this.registry.resolveNamespace(namespace),
      ...this.registry.getFallbackNamespaces(namespace),
    ];
  }
}
