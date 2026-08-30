/**
 * The Portal i18n runtime, kept for applications still on the Portal architecture.
 *
 * New work belongs in `@nocobase/app-i18n`, which is where this is heading: namespaces are package names, resources
 * load one language at a time, and both the browser and the server share one declaration form. This module keeps its
 * own i18next instance until the Portal template is retired, so the two must not be mixed inside one application —
 * each would hold half the resources and only one would follow a language change.
 *
 * @deprecated Use `@nocobase/app-i18n` and its `/client` and `/server` entry points.
 */
export * from './locales.ts';
export * from './runtime.ts';
export * from './translation.ts';
