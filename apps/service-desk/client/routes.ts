import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    auth: 'required',
    name: 'dashboard',
    path: '/',
    componentLoader: () => import('./pages/business-page.js'),
  },
  {
    auth: 'required',
    name: 'dashboard.alias',
    path: '/dashboard',
    componentLoader: () => import('./pages/business-page.js'),
  },
  {
    auth: 'required',
    name: 'tickets',
    path: '/tickets',
    componentLoader: () => import('./pages/business-page.js'),
  },
  {
    auth: 'required',
    name: 'customers',
    path: '/customers',
    componentLoader: () => import('./pages/business-page.js'),
  },
  {
    auth: 'required',
    name: 'catalog',
    path: '/catalog',
    componentLoader: () => import('./pages/business-page.js'),
  },
  {
    auth: 'required',
    name: 'team',
    path: '/team',
    componentLoader: () => import('./pages/business-page.js'),
  },
]);

export default routes;
