import {
  defineAppRoutes,
  type AppClientAppRoutesContribution,
} from '@nocobase/app-client/plugins';

const routes: AppClientAppRoutesContribution = defineAppRoutes([
  {
    name: 'index',
    path: '/system-info',
    componentLoader: () => import('./pages/system-info-page.js'),
  },
]);

export default routes;
