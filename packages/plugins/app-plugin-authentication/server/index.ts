export { default } from './plugin.js';
export * from './auth.js';
export * from './auth-storage.js';
export {
  AUTH_PUBLIC_PATHS,
  defineAuthConfig,
  resolveAuthSecret,
  validateAuthConfig,
} from './config.js';
export * from './better-auth/database-adapter.js';
export {
  AuthenticationProvider,
  createCookiePrefix,
  resolvePublicPath,
  toPublicRequest,
  type AuthenticationProviderConfig,
} from './providers/authentication.js';
export * from './tokens.js';
export * from './user-administration.js';

export type { AuthConfig } from './config.js';
