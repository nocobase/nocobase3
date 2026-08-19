import type { DatabaseManager } from '@nocobase/database';
import type { AppCacheConfig } from '@nocobase/cache';
import type { AppDriveConfig } from '@nocobase/drive';
import type { AppLoggerConfig } from '@nocobase/logger';
import type { AppQueueConfig } from '@nocobase/queue';
import type { AppSessionConfig } from '@nocobase/session';
import type { SpaHandler } from '@nocobase/app-server/spa';
import type { NotificationModuleConfig } from '../registry/notification/server/index.js';

export interface CreateAppOptions {
  appName?: string;
  internalBasePath?: string;
  publicBasePath?: string;
  publicApiUrl?: string;
  internalApiProxyPath?: string;
  cache?: AppCacheConfig;
  database?: DatabaseManager;
  drive?: AppDriveConfig;
  logger?: AppLoggerConfig;
  queue?: AppQueueConfig;
  session?: AppSessionConfig;
  notifications?: CreateAppNotificationsOptions;
  spa?: CreateAppSpaOptions;
  nocoBaseApiUrl?: string | false;
}

export type CreateAppNotificationsOptions = NotificationModuleConfig;

export interface CreateAppSpaOptions {
  handler?: SpaHandler;
  indexPath?: string;
  runtime?: CreateAppSpaRuntimeOptions;
}

export interface CreateAppSpaRuntimeOptions {
  storagePrefix?: string;
  storageType?: string;
  shareToken?: boolean;
}

export type { SpaHandler };
