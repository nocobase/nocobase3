import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'index',
    path: '/files',
    componentLoader: () => import('./default-pages/files-page.js'),
  },
]);

export default routes;
