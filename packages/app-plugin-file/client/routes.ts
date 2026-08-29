import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'demo',
    path: '/file-demo',
    componentLoader: () => import('./default-pages/file-demo-page.js'),
  },
]);

export default routes;
