import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'demo',
    path: '/files-demo',
    componentLoader: () => import('./pages/files-demo-page.js'),
  },
]);

export default routes;
