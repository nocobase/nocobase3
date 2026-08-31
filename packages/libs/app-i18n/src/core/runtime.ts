import {
  createInstance,
  type i18n as I18nInstance,
  type InitOptions,
} from 'i18next';

import { describeLocale, resolveSupportedLocale } from './locales.js';
import { BASE_NAMESPACE, I18nRegistry } from './registry.js';
import type {
  Locale,
  LocaleDefinition,
  LocalesModule,
  Namespace,
  TranslationResource,
} from './types.js';

export interface I18nRuntimeOptions {
  readonly defaultLocale: Locale;
  /** Locales the application offers. Defaults to `[defaultLocale]` when omitted. */
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

  private readonly locales: Locale[];
  private readonly defaultLocale: Locale;
  private initialized = false;
  private readonly localeLoads = new Map<Locale, Promise<void>>();

  public constructor(private readonly options: I18nRuntimeOptions) {
    this.defaultLocale = options.defaultLocale;
    this.locales = [
      ...new Set([options.defaultLocale, ...(options.locales ?? [])]),
    ];
    if (options.applicationNamespace) {
      this.registry.setApplicationNamespace(options.applicationNamespace);
    }
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
  }

  /**
   * Loads a locale across every namespace and feeds it into the instance, at most once per locale.
   *
   * Call this before translating into a locale that has not been used yet. Skipping it does not throw — translations
   * silently fall back to the key or the default language, which is hard to notice, so request handling calls it
   * automatically and code running outside a request must call it itself.
   */
  public async ensureLocaleLoaded(locale: Locale): Promise<void> {
    const resolved = this.resolveLocale(locale);
    const pending = this.localeLoads.get(resolved);
    if (pending) return pending;

    const request = this.loadLocaleResources(resolved);
    this.localeLoads.set(resolved, request);

    try {
      await request;
    } catch (error) {
      // A failed load must not be cached, or the locale could never be retried.
      this.localeLoads.delete(resolved);
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
      fallbackLng: this.defaultLocale,
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
