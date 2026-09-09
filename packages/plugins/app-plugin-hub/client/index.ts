// The plugin's public client surface. The default export is the registration factory an application lists in
// its client/plugins.ts.
export { default } from './plugin.js';
export type { HubClientOptions } from './plugin.js';
export { createHubRoutes, HUB_USER_ACCESS_NAVIGATION } from './routes.js';
