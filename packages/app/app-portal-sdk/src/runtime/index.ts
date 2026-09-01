/**
 * Portal runtime configuration, kept for the code paths that still resolve URLs against a v2 NocoBase server.
 *
 * These helpers read the `NOCOBASE_*` environment and `window` values a Portal build injects, and derive the API URL,
 * application name, and settings and callback URLs of the v2 server behind them. A v3 application resolves its own
 * URLs through `@nocobase/app-client`, so nothing here applies to it.
 *
 * @deprecated Use `@nocobase/app-client` unless you are addressing a v2 NocoBase server.
 */
export * from './config.ts';
export * from './constants.ts';
export * from './store.ts';
