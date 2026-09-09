import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    access: { resource: 'hub', action: 'access' },
    auth: 'required',
    componentLoader: () => import('./pages/applications-redirect.js'),
    name: 'applications-root',
    path: '/',
  },
  {
    access: { resource: 'hub', action: 'access' },
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
