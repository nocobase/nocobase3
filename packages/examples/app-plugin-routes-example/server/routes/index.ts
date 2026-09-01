import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes } from './api.js';
import { rootRoutes } from './root.js';

const routes: readonly AppRouteContribution<AppPluginApplication>[] = [
  rootRoutes,
  apiRoutes,
];

export default routes;
