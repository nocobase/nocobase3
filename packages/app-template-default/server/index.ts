export {
  createApp,
  createApplication,
  joinBasePath,
  normalizeBasePath,
  type AppLifecycle,
  type AppServer,
  type CreateAppOptions,
  type SpaHandler,
} from './app.js';
export {
  Application,
  type ApplicationFetchHandler,
  type ApplicationOptions,
  type ApplicationWebSocketFactory,
} from '@nocobase/app-server-kit/application';
export {
  createServer,
  default,
  type AppDisposer,
  type AppScope,
  type EmbeddedServer,
} from './embedded.js';
export {
  createStandaloneServer,
  startServer,
  type StandaloneServer,
  type StandaloneServerListenOptions,
  type StandaloneServerOptions,
} from './standalone.js';
export {
  createConfiguredApplication,
  createPublicBasePathAdapter,
  stripPublicBasePathFromRequest,
} from './runtime/app.js';
export {
  createStandaloneScope,
  StandaloneScope,
  type StandaloneScopeOptions,
} from './runtime/standalone-scope.js';
export {
  loadAppConfig,
  loadEmbeddedAppConfig,
  loadStandaloneAppConfig,
} from './runtime/config.js';
