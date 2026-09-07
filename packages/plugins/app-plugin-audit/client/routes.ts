import {
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

// Additional audit settings pages join this group without replacing its identity.
const routes: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'audit',
    path: '/audit',
    navigation: { title: 'events.navigation' },
    children: [
      {
        name: 'settings',
        path: '/settings',
        navigation: { title: 'settings.title' },
        access: { resource: 'audit.settings', action: 'read' },
        componentLoader: () => import('./pages/settings.js'),
      },
      {
        name: 'health',
        path: '/health',
        navigation: { title: 'settings.health' },
        access: { resource: 'audit.settings', action: 'read' },
        componentLoader: () => import('./pages/health.js'),
      },
      {
        name: 'events',
        path: '/events',
        navigation: { title: 'events.title' },
        access: { resource: 'audit.events', action: 'read' },
        componentLoader: () => import('./pages/events.js'),
      },
    ],
  },
]);
export default routes;
