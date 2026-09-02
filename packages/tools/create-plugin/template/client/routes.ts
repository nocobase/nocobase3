import {
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

// Add defineAppRoutes(), defineSettingsRoutes(), or defineDevRoutes() contributions here. Keep pages behind lazy
// componentLoader() functions, and do not repeat the App public base path or the built-in /settings and /dev
// prefixes. Pages declared through defineDevRoutes() are absent from a production build.
const routes: readonly AppClientRouteContribution[] = [];

export default routes;
