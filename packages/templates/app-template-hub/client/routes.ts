import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    auth: 'required',
    componentLoader: () => import('./pages/applications-redirect.js'),
    name: 'applications-root',
    path: '/',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/applications-redirect.js'),
    name: 'applications-legacy',
    path: '/hub',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
