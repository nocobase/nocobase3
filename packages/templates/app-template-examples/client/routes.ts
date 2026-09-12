import { FileText, Home, PanelsTopLeft } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    auth: 'required',
    componentLoader: () => import('./pages/home.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
  },
  {
    auth: 'required',
    name: 'routeOverlays',
    path: '/route-overlays',
    navigation: { title: 'navigation.routeOverlays', icon: PanelsTopLeft },
    componentLoader: () => import('./pages/route-overlays.js'),
    children: [
      {
        name: 'routeDialogExample',
        path: 'dialog',
        componentLoader: () => import('./pages/route-dialog-example.js'),
        children: [
          {
            name: 'routeDialogDrawerExample',
            path: 'drawer',
            componentLoader: () =>
              import('./pages/route-drawer-child-example.js'),
          },
        ],
      },
      {
        name: 'routeDrawerExample',
        path: 'drawer',
        componentLoader: () => import('./pages/route-drawer-example.js'),
        children: [
          {
            name: 'routeDrawerDialogExample',
            path: 'dialog',
            componentLoader: () =>
              import('./pages/route-dialog-child-example.js'),
          },
        ],
      },
    ],
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/articles.js'),
    name: 'articles',
    navigation: { title: 'navigation.articles', icon: FileText },
    path: '/articles',
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

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
