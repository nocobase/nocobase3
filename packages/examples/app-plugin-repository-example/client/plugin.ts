import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import serviceProviders from './providers/index.js';
import locales from './locales/index.js';
import routes from './routes.js';

const repositoryExample: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-repository-example',
  locales,
  serviceProviders,
  routes,
});

export default repositoryExample;
