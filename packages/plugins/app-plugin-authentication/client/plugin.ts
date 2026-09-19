import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import serviceProviders from './service-provider.js';
import reactProviders from './react-provider.js';

const authentication: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-authentication',
  serviceProviders,
  reactProviders,
});

export default authentication;
