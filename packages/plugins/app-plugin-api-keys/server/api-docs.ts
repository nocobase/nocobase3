import type { Auth } from '@nocobase/app-plugin-authentication/server';
import type { ApiDocsAccess } from '@nocobase/app-server/router';
import { APIError } from 'better-auth/api';

import { findRequestApiKey, type ApiKeysPlugin } from './api-keys.js';

const PACKAGE_NAME = '@nocobase/app-plugin-api-keys';

/**
 * Lets a request carrying a valid API key read the API documentation. The key is checked exactly as for any other
 * request — Better Auth resolves it to its owner's session, which refuses a disabled, expired or unknown key and a key
 * whose owner is disabled — but without extending a session, so reading the documentation changes no state.
 *
 * Allows nothing when the application has not configured this package's `apiKey()` Better Auth plugin, or when the
 * request carries no key in the headers that plugin reads.
 */
export function createApiKeyApiDocsAccess(
  resolveAuth: () => Pick<Auth, 'getSession' | 'plugin'>,
): ApiDocsAccess {
  return {
    name: PACKAGE_NAME,
    check: async (context) => {
      const auth = resolveAuth();
      const plugin = auth.plugin<ApiKeysPlugin>('api-key');
      if (!plugin?.options?.configurations) return false;
      const headers = context.req.raw.headers;
      const key = findRequestApiKey(plugin, headers);
      if (!key) return false;
      try {
        const session = await auth.getSession(headers, {
          disableRefresh: true,
        });
        // Better Auth answers a request carrying a key with the key's session, whose token is the key itself.
        return session?.session.token === key;
      } catch (error) {
        if (error instanceof APIError) return false;
        throw error;
      }
    },
  };
}
