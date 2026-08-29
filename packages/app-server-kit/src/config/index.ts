export { AppConfig } from './app-config.js';
export {
  envBoolean,
  envInteger,
  envString,
  envStrings,
  type EnvironmentMapping,
} from '@nocobase/config/providers/env';
export {
  appConfig,
  defineAppConfig,
  type AppIdentityConfig,
} from './define-app-config.js';
export type * from './app-config-types.js';
export * from './context.js';
export * from './paths.js';
export type * from './types.js';
