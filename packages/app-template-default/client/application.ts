import { defineClientApplication } from '@nocobase/app-client/plugins';

const application = defineClientApplication({
  packageName: '@nocobase/app-template-default',
  bootstrap: () => import('./bootstrap.js'),
  locales: () => import('./locales/index.js'),
  providers: () => import('./providers.js'),
  routes: () => import('./routes.js'),
});

export default application;
