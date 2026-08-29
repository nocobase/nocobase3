import {
  defineAppRoutes,
  type AppClientAppRoutesContribution,
} from '@nocobase/app-client/plugins';

const routes: AppClientAppRoutesContribution = defineAppRoutes([
  {
    name: 'index',
    path: '/routes-example',
    componentLoader: () => import('./pages/routes-example-page.js'),
  },
]);

export default routes;
