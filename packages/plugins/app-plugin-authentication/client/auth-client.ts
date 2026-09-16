import { createAuthClient } from 'better-auth/client';
import type { usernameClient } from 'better-auth/client/plugins';

export { createAuthClient };
export type AuthConfig = import('better-auth').BetterAuthClientOptions;

/**
 * The Better Auth client plugins an application registers, by plugin id.
 *
 * The client is created here, from the application's config, so its type
 * cannot be inferred from the plugins the application actually passes. A
 * plugin package that adds a Better Auth client plugin augments this
 * interface instead, and `AuthClient` picks it up:
 *
 * ```ts
 * declare module '@nocobase/app-plugin-authentication/client' {
 *   interface AuthClientPluginRegistry {
 *     'api-key': ReturnType<typeof apiKeyClient>;
 *   }
 * }
 * ```
 */
export interface AuthClientPluginRegistry {
  username: ReturnType<typeof usernameClient<{ displayUsername: false }>>;
}

export type AuthClient = ReturnType<
  typeof createAuthClient<{
    plugins: AuthClientPluginRegistry[keyof AuthClientPluginRegistry][];
  }>
>;
