import {
  defineClientRouteComponentOverrides,
  defineClientSourceExtension,
  type AppClientSourceExtension,
} from '@nocobase/app-client/plugins';
import { AUTHENTICATION_ROUTE_IDS } from '@nocobase/app-plugin-authentication/client/route-contracts';

const authenticationUiExtension: AppClientSourceExtension =
  defineClientSourceExtension({
    name: 'nocobase-auth-ui',
    routeComponentOverrides: defineClientRouteComponentOverrides([
      {
        routeId: AUTHENTICATION_ROUTE_IDS.login,
        componentEntry: './client/extensions/nocobase-auth-ui/pages/login-page',
        componentLoader: () => import('./pages/login-page'),
      },
      {
        routeId: AUTHENTICATION_ROUTE_IDS.register,
        componentEntry:
          './client/extensions/nocobase-auth-ui/pages/register-page',
        componentLoader: () => import('./pages/register-page'),
      },
      {
        routeId: AUTHENTICATION_ROUTE_IDS.forgotPassword,
        componentEntry:
          './client/extensions/nocobase-auth-ui/pages/forgot-password-page',
        componentLoader: () => import('./pages/forgot-password-page'),
      },
      {
        routeId: AUTHENTICATION_ROUTE_IDS.resetPassword,
        componentEntry:
          './client/extensions/nocobase-auth-ui/pages/reset-password-page',
        componentLoader: () => import('./pages/reset-password-page'),
      },
    ]),
  });

export default authenticationUiExtension;
