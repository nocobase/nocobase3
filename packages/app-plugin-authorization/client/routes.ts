import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'permission-sets',
    path: '/settings/authorization/permission-sets',
    auth: 'required',
    access: {
      resource: 'authorization.settings.permission-sets',
      action: 'read',
    },
    componentLoader: () => import('./pages/permission-sets-page.js'),
  },
  {
    name: 'default-access',
    path: '/settings/authorization/default-access',
    auth: 'required',
    access: {
      resource: 'authorization.settings.default-access',
      action: 'read',
    },
    componentLoader: () => import('./pages/default-access-page.js'),
  },
  {
    name: 'sharing-rules',
    path: '/settings/authorization/sharing-rules',
    auth: 'required',
    access: {
      resource: 'authorization.settings.sharing-rules',
      action: 'read',
    },
    componentLoader: () => import('./pages/sharing-rules-page.js'),
  },
  {
    name: 'restriction-rules',
    path: '/settings/authorization/restriction-rules',
    auth: 'required',
    access: {
      resource: 'authorization.settings.restriction-rules',
      action: 'read',
    },
    componentLoader: () => import('./pages/restriction-rules-page.js'),
  },
]);

export default routes;
