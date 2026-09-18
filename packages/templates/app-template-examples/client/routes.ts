import { FileText, Home, Hash, PanelsTopLeft, Plug } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // Every signed-in user reaches the landing page. `access: false` takes it out of page authorization entirely, so
    // no permission change can leave a user signed in with nowhere to land.
    access: false,
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
    breadcrumb: { title: 'navigation.routeOverlays' },
    componentLoader: () => import('./pages/route-overlays/index.js'),
    children: [
      {
        name: 'routeDialogExample',
        path: 'dialog',
        componentLoader: () => import('./pages/route-overlays/dialog/index.js'),
        children: [
          {
            name: 'routeDialogDrawerExample',
            path: 'drawer',
            componentLoader: () =>
              import('./pages/route-overlays/dialog/drawer.js'),
          },
        ],
      },
      {
        name: 'routeDrawerExample',
        path: 'drawer',
        componentLoader: () => import('./pages/route-overlays/drawer/index.js'),
        children: [
          {
            name: 'routeDrawerDialogExample',
            path: 'dialog',
            componentLoader: () =>
              import('./pages/route-overlays/drawer/dialog.js'),
          },
        ],
      },
      // The overlays above name no destination and stay out of the breadcrumb. These are pages, so each declares a
      // title and adds a level to the trail — which is the contrast the page is there to show.
      {
        name: 'routeChildPages',
        path: 'pages',
        breadcrumb: { title: 'routeOverlays.childPagesTitle' },
        componentLoader: () => import('./pages/route-overlays/pages/index.js'),
        children: [
          {
            name: 'routeChildPageQuotation',
            path: 'quotation',
            breadcrumb: { title: 'routeOverlays.topicQuotation' },
            componentLoader: () =>
              import('./pages/route-overlays/pages/quotation/index.js'),
            children: [
              // An overlay below a page. It names no destination, so the trail stops at the page above it.
              {
                name: 'routeChildPageDialog',
                path: 'dialog',
                componentLoader: () =>
                  import('./pages/route-overlays/pages/quotation/dialog.js'),
              },
            ],
          },
          {
            name: 'routeChildPageOnboarding',
            path: 'onboarding',
            breadcrumb: { title: 'routeOverlays.topicOnboarding' },
            componentLoader: () =>
              import('./pages/route-overlays/pages/onboarding.js'),
          },
          {
            name: 'routeChildPageRenewal',
            path: 'renewal',
            breadcrumb: { title: 'routeOverlays.topicRenewal' },
            componentLoader: () =>
              import('./pages/route-overlays/pages/renewal.js'),
          },
        ],
      },
    ],
  },
  {
    auth: 'required',
    access: false,
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
    auth: 'required',
    componentLoader: () => import('./pages/external-crm.js'),
    name: 'external-crm',
    navigation: { title: 'navigation.externalCrm', icon: Plug },
    path: '/external-crm',
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
