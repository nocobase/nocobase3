import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'demo',
    path: '/files-demo',
    componentLoader: () => import('./default-pages/files-demo-page.js'),
  },
]);

export default routes;
