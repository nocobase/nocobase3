import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes = defineAppRoutes([
  {
    name: 'index',
    path: __NOCOBASE_ROUTE_PATH_LITERAL__,
    componentLoader: () => import('./pages/index.js'),
  },
]);

const settingsRoutes = defineSettingsRoutes([
  {
    name: __NOCOBASE_SHORT_NAME_LITERAL__,
    path: __NOCOBASE_ROUTE_PATH_LITERAL__,
    componentLoader: () => import('./pages/settings.js'),
    navigation: {
      title: __NOCOBASE_DISPLAY_NAME_LITERAL__,
    },
  },
]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
