import {
  type AppRouteContribution,
} from '@nocobase/app-server-kit/router';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';

// Add defineApiRoutes() or defineRootRoutes() contributions here. Every
// concrete Route must own and test its authentication and authorization
// boundary; never depend on contribution order for protection.
const routes: readonly AppRouteContribution<AppPluginApplication>[] = [];

export default routes;
