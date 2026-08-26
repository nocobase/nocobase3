import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type { AIManager } from '@nocobase/ai-employee';
import type { Auth } from '@nocobase/app-plugin-authentication';
import type { Caching } from '@nocobase/caching';
import type { DatabaseManager } from '@nocobase/app-database';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { SnowflakeIdGenerator } from '@nocobase/id-generator';
import type { Logging } from '@nocobase/logging';
import { initializeAIEmployee } from './runtime.js';

export interface AIEmployeePluginDeps {
  ai: AIManager;
  auth: Auth;
  caching: Caching;
  database: DatabaseManager;
  driveManager?: NocoBaseDriveManager;
  idGenerator: SnowflakeIdGenerator;
  logging: Logging;
}

export type AIEmployeePluginConfig = {
  app: { internalApiProxyPath: string };
};

export type AIEmployeePluginServerContext = AppPluginServerContext<
  AIEmployeePluginDeps,
  unknown,
  AIEmployeePluginConfig
>;

export default function bootstrap({
  config,
  deps,
  paths,
}: AIEmployeePluginServerContext): void {
  initializeAIEmployee({
    apiBasePath: config.app.internalApiProxyPath,
    aiDirectory: paths.root('ai'),
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
