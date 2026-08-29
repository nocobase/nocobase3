import {
  defineAppRoutes,
  type AppClientAppRoutesContribution,
} from '@nocobase/app-client/plugins';

const routes: AppClientAppRoutesContribution = defineAppRoutes([
  {
    auth: 'guest',
    componentLoader: () => import('./pages/install-route.js'),
    name: 'install',
    path: '/install',
  },
]);

export default routes;
