import { createAuthClient } from 'better-auth/client';
import type { usernameClient } from 'better-auth/client/plugins';

export { createAuthClient };
export type AuthConfig = import('better-auth').BetterAuthClientOptions;
export type AuthClient = ReturnType<
  typeof createAuthClient<{
    plugins: [ReturnType<typeof usernameClient<{ displayUsername: false }>>];
  }>
>;
