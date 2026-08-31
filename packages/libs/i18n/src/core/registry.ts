import type {
  Locale,
  LocaleLoader,
  LocaleLoaders,
  LocaleModule,
  LocaleModuleExport,
  LocalesModule,
  Namespace,
  TranslationOverrides,
  TranslationResource,
} from './types.js';

/** The namespace holding the terms the base package ships: save, cancel, confirm, and the like. */
export const BASE_NAMESPACE: Namespace = '@nocobase/i18n';

/**
 * Stands for whichever namespace belongs to the application, resolved when a translation runs.
 *
 * A plugin cannot name the application's namespace directly: it is the user's own package name, chosen long after the
 * plugin was published. Writing `t('save', { ns: APP_NS })` asks for the application's wording without knowing it.
 */
export const APP_NS: Namespace = '@nocobase/i18n/application';

interface RegisteredNamespace {
  readonly namespace: Namespace;
  readonly loaders: LocaleLoaders;
  /** Locales already resolved, so a second request for the same one does no work. */
  readonly loaded: Map<Locale, LocaleModule>;
  /** In-flight loads, so concurrent requests for one locale share a single import. */
  readonly pending: Map<Locale, Promise<LocaleModule | undefined>>;
}

export interface LoadedNamespaceResource {
  readonly namespace: Namespace;
  readonly locale: Locale;
  readonly resource: TranslationResource;
}

export interface LoadLocaleResult {
  readonly locale: Locale;
  readonly resources: readonly LoadedNamespaceResource[];
  /** Overrides declared by the application's locale file, applied after every namespace is registered. */
  readonly overrides: TranslationOverrides;
}

/**
 * Whether a module re-exports its payload under `default`.
 *
 * Both a locale resource and a loader map are open records, so `{ default: ... }` satisfies them structurally too and
 * the two shapes can only be told apart at runtime.
 */
function hasDefaultExport<TValue>(
  module: object,
): module is { readonly default: TValue } {
  return (
    'default' in module &&
    (module as { readonly default?: unknown }).default !== undefined
  );
}

function unwrapLocaleModule(module: LocaleModuleExport): LocaleModule {
  // A locale file typed with its own interface has no index signature, so the resource is re-read as the open record
  // the runtime treats it as. The nesting is what the type describes; the exact keys are the package's own business.
  return (
    hasDefaultExport<LocaleModule>(module) ? module.default : module
  ) as LocaleModule;
}

function unwrapLocalesModule(module: LocalesModule): LocaleLoaders {
  return hasDefaultExport<LocaleLoaders>(module) ? module.default : module;
}

/**
 * Separates a locale module's translations from the `overrides` block an application may attach to it.
 */
function splitOverrides(module: LocaleModule): {
  resource: TranslationResource;
  overrides: TranslationOverrides;
} {
  const { overrides, ...resource } = module;
  return {
    resource,
    overrides: overrides ?? {},
  };
}

/**
 * Holds which namespaces exist, which locales each can produce, and which of those have been loaded.
 *
 * The registry deliberately knows nothing about i18next: it resolves loaders and hands back plain resources, leaving
 * the client and server entry points to feed them into an instance. That keeps the loading rules — one import per
 * namespace and locale, shared between concurrent callers, never repeated — in one place and testable on their own.
 */
export class I18nRegistry {
  private readonly namespaces = new Map<Namespace, RegisteredNamespace>();
  private applicationNamespace: Namespace | undefined;

  /**
   * Registers a namespace's loaders. Registering the same namespace again merges the loaders, so a package can declare
   * additional locales after the initial registration.
   */
  public register(namespace: Namespace, loaders: LocaleLoaders): void {
    const existing = this.namespaces.get(namespace);
    if (!existing) {
      this.namespaces.set(namespace, {
        namespace,
        loaders: { ...loaders },
        loaded: new Map(),
        pending: new Map(),
      });
      return;
    }

    this.namespaces.set(namespace, {
      ...existing,
      loaders: { ...existing.loaders, ...loaders },
    });
  }

  /** Registers a namespace from a `locales/index.ts` module, accepting either a default export or the object itself. */
  public registerModule(namespace: Namespace, module: LocalesModule): void {
    this.register(namespace, unwrapLocalesModule(module));
  }

  /**
   * Marks which namespace belongs to the application, so the fallback chain can point at it and `APP_NS` can resolve.
   */
  public setApplicationNamespace(namespace: Namespace): void {
    this.applicationNamespace = namespace;
  }

  public getApplicationNamespace(): Namespace | undefined {
    return this.applicationNamespace;
  }

  public getNamespaces(): readonly Namespace[] {
    return [...this.namespaces.keys()];
  }

  public hasNamespace(namespace: Namespace): boolean {
    return this.namespaces.has(namespace);
  }

  /**
   * The fallback chain for a namespace: its own keys, then the application's, then the base package's.
   *
   * A plugin that writes `t('save')` without naming a namespace therefore reuses the application's wording, and only
   * falls through to the built-in term when the application has not defined one.
   */
  public getFallbackNamespaces(namespace: Namespace): readonly Namespace[] {
    const resolved = this.resolveNamespace(namespace);
    const chain: Namespace[] = [];
    if (this.applicationNamespace && this.applicationNamespace !== resolved) {
      chain.push(this.applicationNamespace);
    }
    if (resolved !== BASE_NAMESPACE) {
      chain.push(BASE_NAMESPACE);
    }
    return chain;
  }

  /**
   * Turns `APP_NS` into the application's actual package name, and leaves any other namespace as it is.
   *
   * With no application registered the sentinel has nothing to stand for, so it resolves to the base namespace and the
   * lookup still finds the built-in terms instead of failing.
   */
  public resolveNamespace(namespace: Namespace): Namespace {
    if (namespace !== APP_NS) return namespace;
    return this.applicationNamespace ?? BASE_NAMESPACE;
  }

  /** Every locale any registered namespace can produce. */
  public getAvailableLocales(): readonly Locale[] {
    const locales = new Set<Locale>();
    for (const entry of this.namespaces.values()) {
      for (const locale of Object.keys(entry.loaders)) locales.add(locale);
    }
    return [...locales];
  }

  public isLoaded(namespace: Namespace, locale: Locale): boolean {
    return this.namespaces.get(namespace)?.loaded.has(locale) ?? false;
  }

  /**
   * Loads one namespace's resource for a locale, or resolves to `undefined` when that namespace does not translate it.
   *
   * Concurrent callers share one import, and a resolved locale is never imported twice.
   */
  public async loadNamespace(
    namespace: Namespace,
    locale: Locale,
  ): Promise<LocaleModule | undefined> {
    const entry = this.namespaces.get(namespace);
    if (!entry) return undefined;

    const loaded = entry.loaded.get(locale);
    if (loaded) return loaded;

    const pending = entry.pending.get(locale);
    if (pending) return pending;

    const loader: LocaleLoader | undefined = entry.loaders[locale];
    if (!loader) return undefined;

    const request = loader()
      .then((module) => {
        const resolved = unwrapLocaleModule(module);
        entry.loaded.set(locale, resolved);
        return resolved;
      })
      .finally(() => {
        entry.pending.delete(locale);
      });

    entry.pending.set(locale, request);
    return request;
  }

  /**
   * Loads a locale across every registered namespace in parallel.
   *
   * Loading is per locale rather than per namespace: the navigation renders labels owned by every plugin, so their
   * namespaces have to be present from the first frame anyway.
   */
  public async loadLocale(locale: Locale): Promise<LoadLocaleResult> {
    const entries = await Promise.all(
      [...this.namespaces.keys()].map(async (namespace) => {
        const module = await this.loadNamespace(namespace, locale);
        return module ? { namespace, module } : undefined;
      }),
    );

    const resources: LoadedNamespaceResource[] = [];
    let overrides: TranslationOverrides = {};

    for (const entry of entries) {
      if (!entry) continue;
      const split = splitOverrides(entry.module);
      resources.push({
        namespace: entry.namespace,
        locale,
        resource: split.resource,
      });
      // Only the application declares overrides; merging them all keeps the registry from having to care which
      // namespace it came from.
      if (Object.keys(split.overrides).length > 0) {
        overrides = { ...overrides, ...split.overrides };
      }
    }

    return { locale, resources, overrides };
  }
}
