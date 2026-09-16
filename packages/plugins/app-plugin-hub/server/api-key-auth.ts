import { apiKey } from '@nocobase/app-plugin-api-keys/server';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import type { BetterAuthPlugin } from 'better-auth';

export const HUB_API_KEY_CONFIG_ID = 'hub-publishing';

/** Hub policy belongs here; the API Keys plugin remains application-agnostic. */
export function hubApiKeyAuthentication(): BetterAuthPlugin[] {
  return [
    {
      id: 'hub-publishing-key-policy',
      hooks: {
        before: [
          {
            matcher: (context) =>
              Boolean(context.request || context.headers) &&
              context.path?.startsWith('/api-key/') === true,
            handler: createAuthMiddleware(async (context) => {
              const body: unknown = context.body;
              const configId: unknown =
                (body && typeof body === 'object'
                  ? Reflect.get(body, 'configId')
                  : undefined) ?? context.query?.configId;
              if (configId === HUB_API_KEY_CONFIG_ID) {
                throw APIError.from('FORBIDDEN', {
                  code: 'HUB_API_KEY_MANAGEMENT_REQUIRED',
                  message: 'Manage publishing keys through the Hub App.',
                });
              }
              // Better Auth lists all configurations by default. Keep publishing keys out of self-service.
              if (context.path === '/api-key/list' && !configId)
                return {
                  context: { query: { ...context.query, configId: 'default' } },
                };
            }),
          },
        ],
      },
    },
    apiKey([
      { configId: 'default' },
      {
        configId: HUB_API_KEY_CONFIG_ID,
        enableSessionForAPIKeys: false,
        defaultPrefix: 'hub_app_',
        startingCharactersConfig: { shouldStore: true, charactersLength: 16 },
        keyExpiration: { minExpiresIn: 0, maxExpiresIn: 36500 },
      },
    ]),
  ];
}
