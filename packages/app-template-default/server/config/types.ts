import type { CachingConfig } from '@nocobase/caching';
import type { AppDatabaseConfig } from '@nocobase/app-server/database';
import type { AppDriveConfig } from '@nocobase/drive';
import type { LoggingConfig } from '@nocobase/logging';
import type { AppQueueConfig } from '@nocobase/queue';
import type { AppSessionConfig } from '@nocobase/session';
import type { AppAuthConfig } from './auth.js';
import type { AppNotificationConfig } from './notification.js';

export interface AppRoutingConfig {
  name: string;
  publicBasePath: string;
  internalBasePath: string;
  internalApiProxyPath: string;
  publicApiUrl: string;
  nocoBaseApiUrl: string | undefined;
}

export interface AppServerConfig {
  host: string;
  port: number;
  startLog: boolean;
  viteDevUrl: URL | undefined;
}

export interface AppSpaConfig {
  indexPath: string;
  runtime: {
    storagePrefix: string;
    storageType: string;
    shareToken: boolean;
  };
}

export interface AppConfig {
  app: AppRoutingConfig;
  auth: AppAuthConfig;
  caching: CachingConfig;
  database: AppDatabaseConfig;
  drive: AppDriveConfig;
  logging: LoggingConfig;
  queue: AppQueueConfig;
  session: AppSessionConfig;
  notification: AppNotificationConfig;
  server: AppServerConfig;
  spa: AppSpaConfig;
}
