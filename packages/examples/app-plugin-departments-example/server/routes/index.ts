import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { organizationRoutes } from './organization.js';

const routes: readonly AppRouteContribution<AppPluginApplication>[] = [
  organizationRoutes,
];

export default routes;
