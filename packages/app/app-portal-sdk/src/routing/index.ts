/**
 * Route surface containers — the URL-backed drawer, dialog, and page state a Portal page is built on.
 *
 * @deprecated Part of the Portal architecture. New code belongs in `@nocobase/app-client`, whose runtime owns route
 * placement. This entry survives for the pages still written against the Portal surfaces.
 */
export * from './route-surface-context.ts';
export * from './contextual-navigation.ts';
export * from './use-route-surface-close.ts';
export * from './use-route-surface-state.ts';
