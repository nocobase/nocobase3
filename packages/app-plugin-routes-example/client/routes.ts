import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteContribution[] = [
  defineAppRoutes([
    {
      name: 'index',
      path: '/routes-example',
      auth: 'required',
      componentLoader: () => import('./pages/routes-example-page.js'),
    },
  ]),
  defineSettingsRoutes([
    {
      name: 'routes-example',
      path: '/routes-example',
      navigation: { title: 'Routes example' },
      access: { resource: 'routes-example.settings', action: 'read' },
      componentLoader: () => import('./pages/routes-example-settings-page.js'),
    },
  ]),
];

export default routes;
