// The plugin's public client surface. The default export is the registration factory an application lists in its
// client/plugins.ts; it keeps every implementation entry behind a dynamic import, so importing this module costs the
// application only the descriptor.
export { default } from './plugin.js';
