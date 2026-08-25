import {
  defineClientRouteComponentOverrides,
  type AppClientRouteComponentOverrideDefinition,
} from '@nocobase/app-client/plugins';

export const routeOverrides: readonly AppClientRouteComponentOverrideDefinition[] =
  defineClientRouteComponentOverrides([
    {
      routeId: '@nocobase/app-plugin-authentication:login',
      componentLoader: () => import('./auth/login-page.js'),
    },
  ]);
