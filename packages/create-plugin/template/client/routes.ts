import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'index',
    path: __NOCOBASE_ROUTE_PATH_LITERAL__,
    componentLoader: () => import('./pages/index.js'),
  },
]);

export default routes;
