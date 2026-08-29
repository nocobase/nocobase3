/**
 * A locale identifier such as `en-US`. The runtime never parses it beyond comparing the language subtag, so any BCP 47
 * tag the application configures works.
 */
export type Locale = string;

/**
 * A namespace is a package name: `@nocobase/app-plugin-workflow`, or the application's own name. Package names are
 * unique on npm, so nothing has to be registered or deduplicated for them not to collide.
 */
export type Namespace = string;

export type LocaleDirection = 'ltr' | 'rtl';

export interface LocaleDefinition {
  readonly locale: Locale;
  readonly label: string;
  readonly direction: LocaleDirection;
}

/**
 * A nested tree of translations. Leaves are the translated strings; branches group them under a dotted path.
 */
export interface TranslationResource {
  readonly [key: string]:
    string | number | boolean | TranslationResource | undefined;
}

/**
 * Namespaces an application chooses to override, keyed by the namespace they belong to.
 *
 * It lives inside a locale file under `overrides`, letting an application reword a plugin's copy without editing the
 * plugin's source.
 */
export interface TranslationOverrides {
  readonly [namespace: string]: TranslationResource | undefined;
}

/**
 * The default export of a locale file, plus the optional overrides an application may declare.
 */
export type LocaleModule = TranslationResource & {
  readonly overrides?: TranslationOverrides;
};

/**
 * What a `locales/<locale>.ts` file resolves to. The default export carries the resource; a module that exports the
 * resource directly is accepted too, which is what a hand-written test fixture usually does.
 */
export type LocaleModuleExport =
  { readonly default: LocaleModule } | LocaleModule;

export type LocaleLoader = () => Promise<LocaleModuleExport>;

/**
 * A namespace's resources: one loader per locale, so only the locales actually in use are ever fetched.
 *
 * Client and server declare this identically, which is what lets a plugin keep its two `locales/index.ts` files in the
 * same shape.
 */
export type LocaleLoaders = Readonly<Record<Locale, LocaleLoader>>;

/**
 * The default export of a `locales/index.ts` module, as `defineClientPlugin` and `defineServerPlugin` receive it.
 */
export type LocalesModule = { readonly default: LocaleLoaders } | LocaleLoaders;
