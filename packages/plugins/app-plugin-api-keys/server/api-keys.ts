import {
  apiKey as betterAuthApiKey,
  type ApiKeyConfigurationOptions,
} from '@better-auth/api-key';
import type { BetterAuthPlugin } from 'better-auth';

/**
 * Better Auth's API Key plugin with the defaults a NocoBase application wants.
 *
 * `enableSessionForAPIKeys` is the one that has to be set: Better Auth
 * defaults it off, and with it off a key authenticates nothing — the Settings
 * page still issues keys, and every request carrying one answers 401.
 *
 * Every option is overridable, `enableSessionForAPIKeys` included, so passing
 * all three back reproduces Better Auth's own behaviour exactly.
 */
export function apiKey(
  options: ApiKeyConfigurationOptions = {},
): BetterAuthPlugin {
  return betterAuthApiKey({
    enableSessionForAPIKeys: true,
    // Better Auth's default is 10 requests per key per day, which is a quota
    // for issuing keys rather than for using them.
    rateLimit: { enabled: false },
    // The management page identifies a key by its name.
    requireName: true,
    ...options,
  });
}
