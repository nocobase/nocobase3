import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'demo',
    path: '/notification-provider',
    componentLoader: () => import('./pages/notification-demo-page.js'),
  },
]);

export default routes;
