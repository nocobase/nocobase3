import { defineConfig } from '@nocobase/app-server/config';
import { joinBasePath, normalizeBasePath, resolveAppNameFromBasePath } from '@nocobase/app-server/support';

export default defineConfig(({ env }) => {
  const publicBasePath = normalizeBasePath(env.string('APP_BASE_PATH', '/app-template-default'));
  const internalApiProxyPath = '/v2/api';

  return {
    name: resolveAppNameFromBasePath(publicBasePath, 'app-template-default'),
    publicBasePath,
    internalBasePath: '',
    internalApiProxyPath,
    publicApiUrl: joinBasePath(publicBasePath, internalApiProxyPath),
    nocoBaseApiUrl: env.string('NOCOBASE_API_PROXY_TARGET'),
  };
});
