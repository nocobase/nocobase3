import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'login',
    path: '/login',
    auth: 'guest',
    componentLoader: () => import('./default-pages/login-page.js'),
  },
  {
    name: 'register',
    path: '/register',
    auth: 'guest',
    componentLoader: () => import('./default-pages/register-page.js'),
  },
  {
    name: 'forgot-password',
    path: '/forgot-password',
    auth: 'guest',
    componentLoader: () => import('./default-pages/forgot-password-page.js'),
  },
  {
    name: 'reset-password',
    path: '/reset-password',
    auth: 'guest',
    componentLoader: () => import('./default-pages/reset-password-page.js'),
  },
]);

export default routes;
