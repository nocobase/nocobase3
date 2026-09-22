import { Palette } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    authz: { resource: { type: 'page', id: 'hub' }, action: 'access' },
    auth: 'required',
    componentLoader: () => import('./pages/applications-redirect.js'),
    name: 'applications-root',
    path: '/',
  },
  {
    authz: { resource: { type: 'page', id: 'hub' }, action: 'access' },
    auth: 'required',
    componentLoader: () => import('./pages/applications-redirect.js'),
    name: 'applications-legacy',
    path: '/hub',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/login.js'),
    name: 'login',
    path: '/login',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/register.js'),
    name: 'register',
    path: '/register',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/forgot-password.js'),
    name: 'forgot-password',
    path: '/forgot-password',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/reset-password.js'),
    name: 'reset-password',
    path: '/reset-password',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([
  {
    // A settings page carries no access rule on its own. Asking for a page grant keeps the application's own
    // appearance settings with the administrators who own the configuration, and lets them grant the page onward
    // instead of exposing it to every signed-in user. "order" keeps this preference page below the operational ones.
    authz: { resource: { type: 'page', id: 'theme' }, action: 'access' },
    componentLoader: () => import('./pages/settings/theme/index.js'),
    name: 'theme',
    navigation: {
      title: 'appearance.theme.title',
      icon: Palette,
      order: 100,
    },
    path: '/theme',
  },
]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
