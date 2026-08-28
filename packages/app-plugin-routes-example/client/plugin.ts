import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface RoutesExampleClientOptions {
  readonly placeholder?: never;
}

const routesExample: AppClientPluginFactory<RoutesExampleClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-routes-example',
    routes: () => import('./routes.js'),
    providers: () => import('./providers.js'),
  });

export default routesExample;
