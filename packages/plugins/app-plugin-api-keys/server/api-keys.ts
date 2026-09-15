import {
  apiKey as betterAuthApiKey,
  type ApiKeyConfigurationOptions,
} from '@better-auth/api-key';
import { createAuthEndpoint } from 'better-auth/api';
import type { ApiKey } from '@better-auth/api-key';
type ServerEndpoint<
  Options extends Parameters<typeof createAuthEndpoint.serverOnly>[0],
  Result,
> = ReturnType<typeof createAuthEndpoint.serverOnly<string, Options, Result>>;

type UpstreamPlugin = ReturnType<typeof betterAuthApiKey>;
type ManagedQuery = ReturnType<
  UpstreamPlugin['endpoints']['getApiKey']['options']['query']['partial']
>;
type ManagedBody =
  UpstreamPlugin['endpoints']['deleteApiKey']['options']['body'];
export type ApiKeysPlugin = Omit<UpstreamPlugin, 'endpoints'> & {
  endpoints: UpstreamPlugin['endpoints'] & {
    getServerApiKey: ServerEndpoint<
      { method: 'GET'; query: ManagedQuery },
      Omit<ApiKey, 'key'> | null
    >;
    deleteServerApiKey: ServerEndpoint<
      { method: 'POST'; body: ManagedBody },
      { success: boolean }
    >;
  };
};

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
function createApiKeysPlugin(
  options: ApiKeyConfigurationOptions | ApiKeyConfigurationOptions[] = {},
): ApiKeysPlugin {
  const configurations = (Array.isArray(options) ? options : [options]).map(
    (configuration) => ({
      enableSessionForAPIKeys: true,
      rateLimit: { enabled: false },
      requireName: true,
      ...configuration,
    }),
  );
  const plugin = betterAuthApiKey(
    Array.isArray(options) ? configurations : configurations[0],
  );
  const managedQuery: ManagedQuery =
    plugin.endpoints.getApiKey.options.query.partial();
  const managedBody: ManagedBody = plugin.endpoints.deleteApiKey.options.body;
  function requireDatabaseConfiguration(configId: string | undefined): string {
    const id = configId ?? 'default';
    const config = configurations.find(
      (item) => (item.configId ?? 'default') === id,
    );
    if (!config)
      throw new Error(`API key configuration "${id}" is not registered.`);
    if (
      config.customStorage ||
      (config.storage && config.storage !== 'database')
    )
      throw new Error(
        'Server API key management requires the default database schema and storage.',
      );
    return id;
  }
  return {
    ...plugin,
    endpoints: {
      ...plugin.endpoints,
      getServerApiKey: createAuthEndpoint.serverOnly(
        { method: 'GET', query: managedQuery },
        async (ctx) => {
          const configId = requireDatabaseConfiguration(ctx.query.configId);
          if (!ctx.query.id) return null;
          const row = await ctx.context.adapter.findOne<ApiKey>({
            model: 'apikey',
            where: [
              { field: 'id', value: ctx.query.id },
              { field: 'configId', value: configId },
            ],
          });
          if (!row) return null;
          const { key: _hash, ...key } = row;
          return key;
        },
      ),
      deleteServerApiKey: createAuthEndpoint.serverOnly(
        { method: 'POST', body: managedBody },
        async (ctx) => {
          const configId = requireDatabaseConfiguration(ctx.body.configId);
          await ctx.context.adapter.deleteMany({
            model: 'apikey',
            where: [
              { field: 'id', value: ctx.body.keyId },
              { field: 'configId', value: configId },
            ],
          });
          return { success: true };
        },
      ),
    },
  };
}

export function apiKey(
  options: ApiKeyConfigurationOptions | ApiKeyConfigurationOptions[] = {},
): ApiKeysPlugin {
  return createApiKeysPlugin(options);
}
