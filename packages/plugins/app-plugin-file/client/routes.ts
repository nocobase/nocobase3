import {
  defineAppRoutes,
  type AppClientAppRoutesContribution,
} from '@nocobase/app-client/plugins';

const routes: AppClientAppRoutesContribution = defineAppRoutes([
  {
    name: 'demo',
    path: '/file-demo',
    componentLoader: () => import('./default-pages/file-demo-page.js'),
  },
]);

export default routes;
