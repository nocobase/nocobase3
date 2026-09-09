export { default } from './plugin.js';
export * from './auth-storage.js';
export { authenticationConfig, resolveAuthSecret } from './config.js';
export * from './better-auth/database-adapter.js';
export {
  AuthenticationProvider,
  createCookiePrefix,
  type AuthenticationProviderConfig,
} from './providers/authentication.js';
export * from './tokens.js';

export * from './auth-manager.js';
export { resolvePublicPath, toPublicRequest } from './http.js';
export { UsernameProvider } from './providers/username.js';
