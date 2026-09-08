// The plugin's public client surface. The default export is the registration factory an application lists in
// its client/plugins.ts.
export { default } from './plugin.js';
export type { UsersClientOptions } from './plugin.js';
export { createUsersRoutes, USERS_ROUTE_ID } from './routes.js';
