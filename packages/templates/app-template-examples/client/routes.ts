import { FileText, Home, Hash, PanelsTopLeft } from 'lucide-react';
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
    componentLoader: () => import('./pages/articles.js'),
    name: 'articles',
    navigation: { title: 'navigation.articles', icon: FileText },
    path: '/articles',
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
    componentLoader: () => import('./pages/numeric-examples.js'),
    name: 'numeric-examples',
    navigation: { title: 'navigation.numbers', icon: Hash },
    path: '/numeric-examples',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
