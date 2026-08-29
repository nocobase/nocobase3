import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRoutes,
} from '@nocobase/app-server-kit/router';

import { authenticationToken } from './token.js';

export const authenticationApiRoutes: AppApiRoutes<AppPluginApplication> =
  defineApiRoutes({
    name: '@nocobase/app-plugin-authentication/api',
    register(router, app): void {
      const auth = app.container.resolve(authenticationToken);
      router.on(['GET', 'POST'], '/auth/*', (context) =>
        auth.handler(context.req.raw),
      );
    },
  });
