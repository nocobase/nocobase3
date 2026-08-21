import type { AppRuntime } from '@nocobase/app-server/runtime';
import type { AppDriveConfig } from '@nocobase/drive';
import { createEmailChannelDefinition, type EmailMessage, type EmailRecipient } from '@nocobase/notification-email';
import { createInAppChannelDefinition, type InAppMessage, type InAppRecipient } from '@nocobase/notification-in-app';
import { createNotificationManager, type NotificationManager } from '@nocobase/notification';

import type { AppConfig } from '../config/index.js';
import type { AppDeps } from '../runtime/deps.js';
import { AppSettingsService, UnavailableAppSettingsService, type AppSettings } from './app-settings-store.js';
import { FileUploadsService, UnavailableFileUploadsService, type FileUploads } from './public-file-storage.js';

export interface AppNotificationChannels {
  readonly 'in-app': {
    readonly recipient: InAppRecipient;
    readonly message: InAppMessage;
  };
  readonly email: {
    readonly recipient: EmailRecipient;
    readonly message: EmailMessage;
  };
}

export interface AppServices {
  appSettingsStore: AppSettings;
  publicFileStorage: FileUploads;
  notification?: NotificationManager<AppNotificationChannels>;
  start(): Promise<void>;
  dispose(): Promise<void>;
}

export function createAppServices(runtime: AppRuntime<AppConfig>, deps: AppDeps): AppServices {
  const config = runtime.config.notification;
  const notification = config.enabled
    ? createNotificationManager<AppNotificationChannels>({
        database: runtime.database,
        queue: deps.queueManager,
        logger: deps.logging.getLogger().child({ module: 'notification' }),
        config,
        allowNonPersistentStore: config.allowNonPersistentStore,
      })
    : undefined;
  notification?.registerChannel(createInAppChannelDefinition());
  notification?.registerChannel(createEmailChannelDefinition());

  return {
    appSettingsStore: runtime.database ? new AppSettingsService(runtime.database) : new UnavailableAppSettingsService(),
    publicFileStorage:
      deps.driveManager && runtime.config.drive?.disks.public
        ? new FileUploadsService(deps.driveManager)
        : new UnavailableFileUploadsService(resolveFileUploadsUnavailableMessage(runtime.config.drive)),
    notification,
    start: (): Promise<void> => notification?.start() ?? Promise.resolve(),
    dispose: (): Promise<void> => notification?.close() ?? Promise.resolve(),
  };
}

function resolveFileUploadsUnavailableMessage(drive: AppDriveConfig | undefined): string {
  if (!drive) {
    return 'File drive is not configured.';
  }

  return 'Upload drive disk "public" is not configured.';
}

export { AppSettingsService, type AppSetting, type AppSettings } from './app-settings-store.js';
export { FileUploadsService, type FileUploads, type UploadResult } from './public-file-storage.js';
export { AppServiceError, BadRequestError, ServiceUnavailableError } from './errors.js';
