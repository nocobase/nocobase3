import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRoutes,
} from '@nocobase/app-server-kit/router';

import type { AuthenticationProviderConfig } from './provider.js';
import { authenticationToken } from './token.js';

export const authenticationApiRoutes: AppApiRoutes<
  AppPluginApplication<AuthenticationProviderConfig>
> = defineApiRoutes({
  name: '@nocobase/app-plugin-authentication/api',
  register(router, app): void {
    const auth = app.container.resolve(authenticationToken);
    router.on(['GET', 'POST'], '/auth/*', (context) =>
      auth.handler(context.req.raw),
    );
  },
});
