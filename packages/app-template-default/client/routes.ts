import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    auth: 'required',
    componentLoader: () => import('./pages/home.js'),
    name: 'home',
    path: '/',
  },
]);

export default routes;
