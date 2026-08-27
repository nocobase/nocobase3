import {
  defineClientModule,
  type AppClientModuleFactory,
} from '@nocobase/app-client/plugins';

export interface RoutesExampleClientOptions {
  readonly placeholder?: never;
}

const routesExample: AppClientModuleFactory<RoutesExampleClientOptions> =
  defineClientModule({
    packageName: '@nocobase/app-plugin-routes-example',
    routes: () => import('./routes.js'),
    providers: () => import('./providers.js'),
  });

export default routesExample;
