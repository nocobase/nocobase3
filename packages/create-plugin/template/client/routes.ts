import {
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

// Add defineAppRoutes() or defineSettingsRoutes() contributions here. Keep
// pages behind lazy componentLoader() functions, and do not repeat the App
// public base path or the built-in /settings prefix.
const routes: readonly AppClientRouteContribution[] = [];

export default routes;
