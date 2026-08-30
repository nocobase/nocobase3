import type { ConfigPaths } from '@nocobase/app-server-kit/config';
import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type { AIManager } from '@nocobase/ai-employee';
import type { Auth } from '@nocobase/app-plugin-authentication';
import type { Caching } from '@nocobase/caching';
import type { DatabaseManager } from '@nocobase/app-database';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { IdGeneratorService } from '@nocobase/id-generator';
import type { Logging } from '@nocobase/logging';
import { initializePluginRuntimeResources } from './runtime.js';

export interface AIEmployeePluginDeps {
  ai: AIManager;
  paths: ConfigPaths;
  auth: Auth;
  caching: Caching;
  database: DatabaseManager;
  driveManager?: NocoBaseDriveManager;
  idGenerator: IdGeneratorService;
  logging: Logging;
}

export default function bootstrap({
  deps,
}: AppPluginServerContext<AIEmployeePluginDeps>): void {
  initializePluginRuntimeResources(deps);
}
