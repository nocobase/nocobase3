import {
  Fragment,
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  type ComponentType,
  type PropsWithChildren,
  type ReactElement,
} from 'react';
import {
  I18nextProvider,
  useTranslation as useI18nextTranslation,
} from 'react-i18next';
import type {
  UseTranslationOptions,
  UseTranslationResponse,
} from 'react-i18next';

import type { I18nRuntime, Namespace } from '../core/index.js';

const RuntimeContext = createContext<I18nRuntime | undefined>(undefined);
const NamespaceContext = createContext<Namespace | undefined>(undefined);

export interface I18nProviderProps {
  readonly runtime: I18nRuntime;
}

/**
 * Puts the runtime and its i18next instance in context. Mounted once, above everything that translates.
 */
export function I18nProvider({
  runtime,
  children,
}: PropsWithChildren<I18nProviderProps>): ReactElement {
  return createElement(
    RuntimeContext.Provider,
    { value: runtime },
    createElement(I18nextProvider, { i18n: runtime.i18n }, children),
  );
}

export function useI18nRuntime(): I18nRuntime {
  const runtime = useOptionalI18nRuntime();
  if (!runtime) {
    throw new Error(
      'No i18n runtime in context. Render the tree inside <I18nProvider>.',
    );
  }
  return runtime;
}

/**
 * The runtime if one is mounted, `undefined` otherwise.
 *
 * A component that merely offers translation — a language switcher, say — should render nothing rather than break a
 * tree that has no i18n at all, which is what a focused test usually renders.
 */
export function useOptionalI18nRuntime(): I18nRuntime | undefined {
  return useContext(RuntimeContext);
}

export interface NamespaceScopeProps {
  readonly ns: Namespace;
}

/**
 * Makes a namespace the default for everything rendered inside it, so a plugin's own pages translate without naming it.
 *
 * The application host wraps each contribution in this using the package name it already records, which is what lets a
 * plugin page call `useTranslation()` with no arguments.
 *
 * The scope follows the render tree rather than code ownership: a component a plugin exports for the application to
 * render sits in the application's scope, not its own, and has to name its namespace explicitly.
 */
export function NamespaceScope({
  ns,
  children,
}: PropsWithChildren<NamespaceScopeProps>): ReactElement {
  // Scoping is an enhancement, not a requirement: a tree rendered without i18n — a focused test, or a host that has
  // not mounted it — still renders its children rather than failing.
  const runtime = useOptionalI18nRuntime();
  const resolved = useMemo(
    () => runtime?.registry.resolveNamespace(ns) ?? ns,
    [runtime, ns],
  );
  // The whole chain goes into `defaultNS`, not just the namespace itself: i18next reads `fallbackNS` from instance
  // options only, and one instance serves every namespace here, so the ordered list is what carries the fallback.
  const chain = useMemo(
    () =>
      runtime
        ? [resolved, ...runtime.registry.getFallbackNamespaces(resolved)]
        : [resolved],
    [runtime, resolved],
  );

  if (!runtime) return createElement(Fragment, null, children);

  return createElement(
    NamespaceContext.Provider,
    { value: resolved },
    createElement(
      I18nextProvider,
      { i18n: runtime.i18n, defaultNS: chain },
      children,
    ),
  );
}

/** The namespace in scope, if any. */
export function useNamespace(): Namespace | undefined {
  return useContext(NamespaceContext);
}

/**
 * Binds a component to a namespace regardless of where it is rendered.
 *
 * Use it on anything a plugin exports for reuse elsewhere in the application, where the surrounding scope would
 * otherwise be the application's.
 */
export function withNamespace<TProps extends object>(
  ns: Namespace,
  Component: ComponentType<TProps>,
): ComponentType<TProps> {
  const Wrapped = (props: TProps): ReactElement =>
    createElement(NamespaceScope, { ns }, createElement(Component, props));
  Wrapped.displayName = `withNamespace(${Component.displayName ?? Component.name ?? 'Component'})`;
  return Wrapped;
}

export type { UseTranslationOptions, UseTranslationResponse };

type DynamicTranslation = (
  key: unknown,
  optionsOrDefaultValue?: unknown,
  options?: unknown,
) => unknown;

function isNamespaceList(value: unknown): value is readonly Namespace[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  );
}

function resolveNamespaces(
  runtime: I18nRuntime,
  namespaces: Namespace | readonly Namespace[],
): Namespace[] {
  const requested = typeof namespaces === 'string' ? [namespaces] : namespaces;
  const primary = requested.map((namespace) =>
    runtime.registry.resolveNamespace(namespace),
  );
  const fallbacks = requested.flatMap((namespace) =>
    runtime.getNamespaceChain(namespace).slice(1),
  );
  return [...new Set([...primary, ...fallbacks])];
}

function resolveTranslationOptions(
  runtime: I18nRuntime,
  value: unknown,
): unknown {
  if (typeof value !== 'object' || value === null || !('ns' in value)) {
    return value;
  }
  const options = value as { readonly ns?: unknown };
  if (typeof options.ns !== 'string' && !isNamespaceList(options.ns)) {
    return value;
  }
  return {
    ...value,
    ns: resolveNamespaces(runtime, options.ns),
  };
}

/**
 * Translates within the namespace in scope, or the one named.
 *
 * Works without a runtime mounted — a focused test, or a host that has not set i18n up — where it returns each key's
 * declared default instead of warning. Callers therefore have to pass `defaultValue` for a string that must stay
 * readable in that case; `t('a.b')` on its own would render as its key.
 */
export function useTranslation<KPrefix = undefined>(
  ns?: Namespace | readonly Namespace[],
  options?: UseTranslationOptions<KPrefix>,
): UseTranslationResponse<never, KPrefix> {
  const runtime = useOptionalI18nRuntime();
  const resolvedNamespaces = useMemo(
    () => (runtime && ns ? resolveNamespaces(runtime, ns) : ns),
    [runtime, ns],
  );
  const response = useI18nextTranslation(
    resolvedNamespaces as never,
    options as never,
  ) as UseTranslationResponse<never, KPrefix>;
  const underlyingT = response.t as unknown as DynamicTranslation;
  const t = useCallback(
    ((
      key: unknown,
      optionsOrDefaultValue?: unknown,
      trailingOptions?: unknown,
    ) => {
      if (!runtime) {
        return underlyingT(key, optionsOrDefaultValue, trailingOptions);
      }
      if (typeof optionsOrDefaultValue === 'string') {
        return underlyingT(
          key,
          optionsOrDefaultValue,
          resolveTranslationOptions(runtime, trailingOptions),
        );
      }
      return underlyingT(
        key,
        resolveTranslationOptions(runtime, optionsOrDefaultValue),
      );
    }) as unknown as typeof response.t,
    [runtime, underlyingT],
  );

  return useMemo(
    () =>
      Object.assign([t, response.i18n, response.ready], {
        t,
        i18n: response.i18n,
        ready: response.ready,
      }) as UseTranslationResponse<never, KPrefix>,
    [response.i18n, response.ready, t],
  );
}
