import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'index',
    path: '/routes-example',
    componentLoader: () => import('./pages/routes-example-page.js'),
  },
]);

export default routes;
