import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import { createApiKeysRoutes } from './routes.js';

export interface ApiKeysClientOptions {
  /** Path relative to /settings, for example `/api-keys`. */
  readonly path?: string;
  readonly title?: string;
}

const apiKeys: AppClientPluginFactory<ApiKeysClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-api-keys',
    locales,
    routes: (options) => createApiKeysRoutes(options),
  });

export default apiKeys;
