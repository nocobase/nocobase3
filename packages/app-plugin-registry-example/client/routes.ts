import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'index',
    path: '/registry-example',
    componentLoader: () => import('./default-pages/registry-example-page.js'),
  },
]);

export default routes;
