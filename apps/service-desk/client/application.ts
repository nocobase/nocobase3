import { defineClientApplication } from '@nocobase/app-client/plugins';

const application = defineClientApplication({
  packageName: '@nocobase/app-service-desk',
  loadBootstrap: () => import('./bootstrap.js'),
  loadRoutes: () => import('./routes.js'),
});

export default application;
