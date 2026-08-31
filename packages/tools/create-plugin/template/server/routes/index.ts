import {
  type AppRouteContribution,
} from '@nocobase/app-server-kit/router';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';

// Add defineApiRoutes() or defineRootRoutes() contributions here. Every Route
// must own and test an explicit security policy. Authenticated Routes install
// their own authentication and authorization; public callbacks document and
// test their protocol-specific boundary. Never depend on contribution order.
const routes: readonly AppRouteContribution<AppPluginApplication>[] = [];

export default routes;
