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
      // The overlays above name no destination and stay out of the breadcrumb. These are pages, so each declares a
      // title and adds a level to the trail — which is the contrast the page is there to show.
      {
        name: 'routeChildPages',
        path: 'pages',
        title: 'routeOverlays.childPagesTitle',
        componentLoader: () => import('./pages/route-child-pages.js'),
        children: [
          {
            name: 'routeChildPageDetail',
            path: ':recordId',
            // A parameterised route cannot carry navigation, so this is the only name it has until the page
            // reports the record's own through usePageTitle.
            title: 'routeOverlays.childPageDetailTitle',
            componentLoader: () => import('./pages/route-child-page-detail.js'),
            children: [
              {
                name: 'routeChildPageDialog',
                path: 'dialog',
                componentLoader: () =>
                  import('./pages/route-child-page-dialog.js'),
              },
            ],
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
    auth: 'required',
    componentLoader: () => import('./pages/numeric-examples.js'),
    name: 'numeric-examples',
    navigation: { title: 'navigation.numbers', icon: Hash },
    path: '/numeric-examples',
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
