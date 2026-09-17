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
        after: [
          {
            matcher: (context) => context.path === '/api-key/create',
            handler: createAuthMiddleware(async (context) => {
              const created: unknown = context.context.returned;
              if (!created || typeof created !== 'object') return;
              const id: unknown = Reflect.get(created, 'id');
              const referenceId: unknown = Reflect.get(created, 'referenceId');
              if (typeof id !== 'string' || typeof referenceId !== 'string')
                return;
              // Recheck after persistence: a request authenticated before deletion
              // must not leave a credential behind when it finishes afterward.
              const user =
                await context.context.internalAdapter.findUserById(referenceId);
              if (user && Reflect.get(user, 'disabledAt') == null) return;
              await context.context.adapter.deleteMany({
                model: 'apikey',
                where: [{ field: 'id', value: id }],
              });
              throw APIError.from('FORBIDDEN', {
                code: 'ACCOUNT_DISABLED',
                message: 'This account is disabled.',
              });
            }),
          },
        ],
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
