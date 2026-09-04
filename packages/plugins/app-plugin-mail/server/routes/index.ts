import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { mailApiRoutes } from './api.js';
import { mailOAuthCallbackRoutes } from './oauth-callback.js';

const routes: readonly AppRouteContribution<AppPluginApplication>[] = [
  mailOAuthCallbackRoutes,
  mailApiRoutes,
];

export default routes;
