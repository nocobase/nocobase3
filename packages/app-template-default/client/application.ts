import { defineClientApplication } from '@nocobase/app-client/plugins';

const application = defineClientApplication({
  packageName: '@nocobase/app-template-default',
  loadBootstrap: () => import('./bootstrap.js'),
  loadProviders: () => import('./providers.js'),
  loadRoutes: () => import('./routes.js'),
});

export default application;
