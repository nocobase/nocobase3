import type { CachingConfig } from '@nocobase/caching';
import type { AppDatabaseConfig } from '@nocobase/app-server-kit/database';
import type { AppDriveConfig } from '@nocobase/drive';
import type { AppI18nConfig } from '@nocobase/app-server-kit/i18n';
import type { LoggingConfig } from '@nocobase/logging';
import type { SnowflakeIdGeneratorConfig } from '@nocobase/id-generator';
import type { AppQueueConfig } from '@nocobase/queue';
import type { AppSessionConfig } from '@nocobase/session';
import type { AppAuthConfig } from './auth.js';
import type { WorkflowRuntimeConfig } from '@nocobase/app-plugin-workflow/server/config';
import type { ResolvedAppPlugin } from '@nocobase/app-server-kit/plugins';
import type {
  SpaHandler,
  SpaRuntimeGlobals,
} from '@nocobase/app-server-kit/spa';
import type { AppRuntimeConfigContext } from '@nocobase/app-server-kit/runtime';

export type AppWorkflowConfig = WorkflowRuntimeConfig;

export interface DefaultAppScopeConfig {
  readonly publicOrigin?: string;
  readonly apiClientStoragePrefix?: string;
  readonly apiClientStorageType?: string;
  readonly apiClientShareToken?: boolean;
  readonly authSecret?: string;
}

export interface AppRoutingConfig {
  name: string;
  publicOrigin: string | undefined;
  publicBasePath: string;
  internalBasePath: string;
  publicApiUrl: string;
}

export interface AppServerConfig {
  host: string;
  port: number;
  startLog: boolean;
  viteDevUrl: URL | undefined;
}

export interface AppSpaConfig {
  indexPath: string;
  handler?: SpaHandler;
  runtimeGlobals?: SpaRuntimeGlobals;
  runtime: {
    storagePrefix: string;
    storageType: string;
    shareToken: boolean;
  };
}

export interface AppConfig {
  app: AppRoutingConfig;
  plugins: readonly ResolvedAppPlugin[];
  auth: AppAuthConfig;
  caching: CachingConfig;
  database: AppDatabaseConfig;
  drive: AppDriveConfig;
  i18n: AppI18nConfig;
  logging: LoggingConfig;
  queue: AppQueueConfig;
  session: AppSessionConfig;
  workflow: AppWorkflowConfig;
  server: AppServerConfig;
  snowflake: SnowflakeIdGeneratorConfig;
  spa: AppSpaConfig;
}

export type DefaultAppConfigContext = AppRuntimeConfigContext<
  AppConfig,
  DefaultAppScopeConfig
>;
