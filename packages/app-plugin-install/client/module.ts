import {
  defineClientModule,
  type AppClientModuleFactory,
} from '@nocobase/app-client/plugins';

export interface InstallClientOptions {
  readonly placeholder?: never;
}

const install: AppClientModuleFactory<InstallClientOptions> =
  defineClientModule({
    packageName: '@nocobase/app-plugin-install',
    routes: () => import('./routes.js'),
    providers: () => import('./providers.js'),
  });

export default install;
