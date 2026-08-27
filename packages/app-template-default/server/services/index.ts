import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import type { AppDriveConfig } from '@nocobase/drive';
import {
  createNotificationManager,
  type NotificationChannelMap,
  type NotificationService,
} from '@nocobase/app-plugin-notification';

import type { AppConfig } from '../config/index.js';
import type { RealtimeService } from '../realtime/service.js';
import type { AppDeps } from '../runtime/deps.js';
import {
  AppSettingsService,
  UnavailableAppSettingsService,
  type AppSettings,
} from './app-settings-store.js';
import {
  FileUploadsService,
  UnavailableFileUploadsService,
  type FileUploads,
} from './public-file-storage.js';

export interface AppServices {
  appSettingsStore: AppSettings;
  notification: NotificationService | undefined;
  publicFileStorage: FileUploads;
  realtime: RealtimeService;
}

export interface CreateAppServicesOptions {
  realtime: RealtimeService;
}

export function createAppServices(
  runtime: AppRuntime<AppConfig>,
  deps: AppDeps,
  options: CreateAppServicesOptions,
): AppServices {
  return {
    appSettingsStore: runtime.database
      ? new AppSettingsService(runtime.database)
      : new UnavailableAppSettingsService(),
    publicFileStorage:
      deps.driveManager && runtime.config.drive?.disks.public
        ? new FileUploadsService(deps.driveManager)
        : new UnavailableFileUploadsService(
            resolveFileUploadsUnavailableMessage(runtime.config.drive),
          ),
    notification:
      runtime.database && notificationPluginEnabled(runtime.config)
        ? createNotificationManager<NotificationChannelMap>({
            database: runtime.database,
            queue: deps.queueManager,
            logger: deps.logging.getLogger().child({ module: 'notification' }),
            config: runtime.config.notification,
          })
        : undefined,
    realtime: options.realtime,
  };
}

function notificationPluginEnabled(config: AppConfig): boolean {
  return config.plugins.some(
    (plugin) =>
      plugin.enabled &&
      plugin.packageName === '@nocobase/app-plugin-notification',
  );
}

function resolveFileUploadsUnavailableMessage(
  drive: AppDriveConfig | undefined,
): string {
  if (!drive) {
    return 'File drive is not configured.';
  }

  return 'Upload drive disk "public" is not configured.';
}

export {
  AppSettingsService,
  type AppSetting,
  type AppSettings,
} from './app-settings-store.js';
export {
  FileUploadsService,
  type FileUploads,
  type UploadResult,
} from './public-file-storage.js';
export {
  AppServiceError,
  BadRequestError,
  ServiceUnavailableError,
} from './errors.js';
