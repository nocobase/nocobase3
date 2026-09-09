import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import serviceProviders from './providers/index.js';
import { createHubRoutes } from './routes.js';

export interface HubClientOptions {
  /** App-relative path for application management. Defaults to `/hub`. */
  readonly applicationsPath?: string;
  /** App-relative path for the read-only Hub role matrix. Omit to disable it. */
  readonly rolesPath?: string;
  /** Groups user and role management together in primary navigation. */
  readonly userAccessNavigation?: boolean;
}

const hub: AppClientPluginFactory<HubClientOptions> = defineClientPlugin({
  packageName: '@nocobase/app-plugin-hub',
  locales,
  routes: (options) => createHubRoutes(options),
  serviceProviders,
});

export default hub;
