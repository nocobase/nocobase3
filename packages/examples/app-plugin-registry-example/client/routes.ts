import {
  defineAppRoutes,
  type AppClientAppRoutesContribution,
} from '@nocobase/app-client/plugins';

const routes: AppClientAppRoutesContribution = defineAppRoutes([
  {
    name: 'index',
    path: '/registry-example',
    authz: { resource: { type: 'page', id: 'index' }, action: 'access' },
    componentLoader: () => import('./default-pages/registry-example-page.js'),
  },
]);

export default routes;
