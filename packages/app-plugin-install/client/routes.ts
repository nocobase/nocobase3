import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    auth: 'guest',
    componentLoader: () => import('./pages/install-route.js'),
    name: 'install',
    path: '/install',
  },
]);

export default routes;
