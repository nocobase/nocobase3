import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

const routesExample: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-routes-example',
  routes: () => import('./routes.js'),
  providers: () => import('./providers.js'),
});

export default routesExample;
