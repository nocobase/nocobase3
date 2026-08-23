import { defineConfig, type ConfigFactory } from '@nocobase/app-server/config';
import {
  joinBasePath,
  normalizeBasePath,
  resolveAppNameFromBasePath,
} from '@nocobase/app-server/support';
import type { AppRoutingConfig } from './types.js';

const appConfig: ConfigFactory<AppRoutingConfig> = defineConfig(
  ({ env }): AppRoutingConfig => {
    const publicBasePath = normalizeBasePath(
      env.string('APP_BASE_PATH', '/app-template-default'),
    );
    const internalApiProxyPath = '/v2/api';

    return {
      name: resolveAppNameFromBasePath(publicBasePath, 'app-template-default'),
      publicBasePath,
      internalBasePath: '',
      internalApiProxyPath,
      publicApiUrl: joinBasePath(publicBasePath, internalApiProxyPath),
      nocoBaseApiUrl: env.string('NOCOBASE_API_PROXY_TARGET'),
    };
  },
);

export default appConfig;
