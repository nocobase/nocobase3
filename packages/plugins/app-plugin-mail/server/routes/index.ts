import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { mailApiRoutes } from './api.js';

const routes: readonly AppRouteContribution<AppPluginApplication>[] = [
  mailApiRoutes,
];

export default routes;
