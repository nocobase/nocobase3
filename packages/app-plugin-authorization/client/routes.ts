import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'permission-sets',
    path: '/settings/authorization/permission-sets',
    auth: 'required',
    componentLoader: () => import('./pages/permission-sets-page.js'),
  },
]);

export default routes;
