import {
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

// Add defineAppRoutes(), defineSettingsRoutes(), or defineDevRoutes() contributions here. Keep pages behind lazy
// componentLoader() functions, and do not repeat the App public base path or the built-in /settings and /dev
// prefixes. Pages declared through defineDevRoutes() are absent from a production build.
// Define menu entries with navigation here, not with Refine resources. Use children for nested pages or
// navigation groups; a page with children must place <Outlet /> where the child content should render.
// Omit componentLoader for a pure navigation group, and omit navigation for a page without a menu entry.
const routes: readonly AppClientRouteContribution[] = [];

export default routes;
