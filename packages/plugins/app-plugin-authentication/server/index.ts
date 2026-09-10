export { default } from './plugin.js';
export * from './auth.js';
export * from './auth-storage.js';
export { resolveAuthSecret } from './config.js';
export * from './better-auth/database-adapter.js';
export {
  AuthenticationProvider,
  createCookiePrefix,
  resolvePublicPath,
  toPublicRequest,
  type AuthenticationProviderConfig,
} from './providers/authentication.js';
export * from './tokens.js';

export type { AuthConfig } from './config.js';
