import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import type {
  AIEmployeePluginConfig,
  AIEmployeePluginDeps,
} from '../bootstrap.js';
import { registerAIEmployeeAppRoutes } from '../runtime.js';

export * from './contracts.js';
export * from './router.js';

export type AIEmployeePluginRoutesContext = AppPluginRoutesContext<
  AIEmployeePluginDeps,
  unknown,
  AIEmployeePluginConfig
>;

export default function registerRoutes({
  app,
  config,
  deps,
}: AIEmployeePluginRoutesContext): void {
  registerAIEmployeeAppRoutes(app, {
    apiBasePath: config.app.internalApiProxyPath,
    deps: {
      ai: deps.ai,
      database: deps.database.connection(),
      auth: deps.auth,
      caching: deps.caching,
      driveManager: deps.driveManager,
      idGenerator: deps.idGenerator,
      logging: deps.logging,
    },
  });
}
