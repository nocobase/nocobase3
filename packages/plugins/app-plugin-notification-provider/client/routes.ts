import {
  defineAppRoutes,
  type AppClientAppRoutesContribution,
} from '@nocobase/app-client/plugins';

const routes: AppClientAppRoutesContribution = defineAppRoutes([
  {
    name: 'demo',
    path: '/notification-provider',
    componentLoader: () => import('./pages/notification-demo-page.js'),
  },
]);

export default routes;
