import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import type { AppDriveConfig } from '@nocobase/drive';
import type {
  InAppMessage,
  InAppRecipient,
} from '@nocobase/app-plugin-notification-in-app';
import type {
  EmailMessage,
  EmailRecipient,
} from '@nocobase/app-plugin-notification-providers';
import {
  createNotificationManager,
  createNotificationRegistry,
  type NotificationManager,
  type NotificationRegistry,
} from '@nocobase/app-plugin-notification';
import { createSessionMiddleware } from '@nocobase/session';

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
  notificationRegistry?: NotificationRegistry;
  realtime: RealtimeService;
  start(): Promise<void>;
  dispose(): Promise<void>;
}

export interface CreateAppServicesOptions {
  realtime: RealtimeService;
}

export function createAppServices(
  runtime: AppRuntime<AppConfig>,
  deps: AppDeps,
  options: CreateAppServicesOptions,
): AppServices {
  const config = runtime.config.notification;
  const database = runtime.database;
  let notification: NotificationManager<AppNotificationChannels> | undefined;
  let notificationRegistry: NotificationRegistry | undefined;
  if (config.enabled) {
    if (!database) {
      throw new Error('Notifications require a configured database.');
    }
    notificationRegistry = createNotificationRegistry();
    notification = createNotificationManager<AppNotificationChannels>({
      database,
      queue: deps.queueManager,
      logger: deps.logging.getLogger('notification'),
      config,
      registry: notificationRegistry,
    });
  }
  notification?.router.use('*', createSessionMiddleware(deps.sessionManager));

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
    notification,
    notificationRegistry,
    realtime: options.realtime,
    start: (): Promise<void> => notification?.start() ?? Promise.resolve(),
    dispose: (): Promise<void> => notification?.close() ?? Promise.resolve(),
  };
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
