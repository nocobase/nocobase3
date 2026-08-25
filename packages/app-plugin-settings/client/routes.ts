import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    auth: 'required',
    componentLoader: () => import('./pages/settings-center-page.js'),
    name: 'settings',
    path: '/settings',
    surface: 'standalone',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/settings-module-page.js'),
    name: 'settings.module',
    path: '/settings/:moduleId',
    surface: 'standalone',
  },
]);

export default routes;
