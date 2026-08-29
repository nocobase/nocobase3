import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes = defineAppRoutes([
  {
    name: 'index',
    path: '/audit-log',
    componentLoader: () => import('./pages/index.js'),
  },
]);

const settingsRoutes = defineSettingsRoutes([
  {
    name: 'audit-log',
    path: '/audit-log',
    componentLoader: () => import('./pages/settings.js'),
    navigation: { title: 'Audit Log App Plugin' },
  },
]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
