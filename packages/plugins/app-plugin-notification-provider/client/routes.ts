import {
  defineAppRoutes,
  type AppClientAppRoutesContribution,
} from '@nocobase/app-client/plugins';

const routes: AppClientAppRoutesContribution = defineAppRoutes([
  {
    name: 'demo',
    path: '/notification-provider',
    authz: { resource: { type: 'page', id: 'demo' }, action: 'access' },
    componentLoader: () => import('./pages/notification-demo-page.js'),
  },
]);

export default routes;
